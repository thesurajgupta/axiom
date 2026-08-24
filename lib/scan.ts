import {
  type Browser,
  type BrowserContext,
  type Response,
} from "playwright-core";
import { launchBrowser } from "./browser";
import { crawl, type DiscoveredLink } from "./crawl";
import { keyboardFindings, staticA11yFindings } from "./checks/a11y";
import {
  documentFindings,
  readDocumentFacts,
  siteFileFindings,
} from "./checks/launch";
import { checkLinks } from "./checks/links";
import { responsiveFindings } from "./checks/responsive";
import {
  cookieFindings,
  exposedFileFindings,
  headerFindings,
  httpsRedirectFindings,
  mixedContentFindings,
  sourceMapFindings,
} from "./checks/security";
import {
  collectRuntime,
  performanceFindings,
  runtimeFindings,
} from "./checks/runtime";
import {
  countBySeverity,
  mergeFindings,
  sortFindings,
  type Finding,
} from "./findings";
import { buildAgentPrompt, buildCssFixes } from "./prompt";

const NAV_TIMEOUT_MS = 30_000;

export type ScanDepth = "page" | "site";

export interface ScanResult {
  url: string;
  finalUrl: string;
  scannedAt: string;
  depth: ScanDepth;
  findings: Finding[];
  counts: ReturnType<typeof countBySeverity>;
  pagesAudited: string[];
  linksChecked: number;
  tabStops: number;
  agentPrompt: string;
  cssFixes: string | null;
  durationMs: number;
}

export type ScanEvent =
  | { type: "status"; message: string }
  | { type: "page"; url: string; index: number; total: number }
  | { type: "finding"; finding: Finding }
  | { type: "done"; result: ScanResult }
  | { type: "error"; message: string };

export interface ScanOptions {
  url: string;
  depth?: ScanDepth;
  /** Upper bound on pages crawled. Ignored when depth is "page". */
  maxPages?: number;
  /** Total wall-clock budget. The scan degrades gracefully rather than truncating. */
  timeBudgetMs?: number;
  onEvent?: (event: ScanEvent) => void;
}

/**
 * Audit a site.
 *
 * A one-page check is not an audit. Real defects hide on the pages nobody
 * revisits, and the ones that matter most — a dead link, a control that only
 * breaks at 390px — cannot be found by reading source. So this crawls, and on
 * every page it opens a real browser, watches what fails, presses Tab through
 * the whole thing, and renders it on a phone.
 *
 * It takes as long as it takes. That is the point.
 */
export async function scan({
  url,
  depth = "site",
  maxPages = 25,
  timeBudgetMs = 30 * 60_000,
  onEvent,
}: ScanOptions): Promise<ScanResult> {
  const emit = (event: ScanEvent) => onEvent?.(event);
  const startedAt = Date.now();
  const deadline = startedAt + timeBudgetMs;
  let browser: Browser | null = null;

  const findings: Finding[] = [];
  const record = (incoming: Finding[], page?: string) => {
    for (const finding of incoming) {
      const withPage = page ? { ...finding, pages: [page] } : finding;
      findings.push(withPage);
      emit({ type: "finding", finding: withPage });
    }
  };

  try {
    browser = await launchBrowser();

    // Bundlers rewrite named function expressions to call a `__name` helper for
    // stack-trace fidelity. That helper lives in our module scope, not in the
    // page, so any evaluate() containing a named inner function throws on
    // arrival. Defining it as identity in the page makes the rewritten code run.
    const shimNames = (target: BrowserContext) =>
      target.addInitScript(() => {
        (window as unknown as Record<string, unknown>).__name ??= <T,>(fn: T): T => fn;
      });

    const baseOptions = {
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce" as const,
    };

    // Two contexts, for a reason that matters.
    //
    // Injecting an audit harness requires bypassing the site's Content Security
    // Policy — but bypassing CSP also suppresses the failures the policy itself
    // causes. A site whose CSP blocks its own scripts looks perfectly healthy
    // through a bypassed browser. So runtime behaviour is always observed under
    // the site's real policy, and only the instrumented pass bypasses it.
    const observeContext = await browser.newContext(baseOptions);
    const auditContext = await browser.newContext({
      ...baseOptions,
      bypassCSP: true,
    });
    await Promise.all([shimNames(observeContext), shimNames(auditContext)]);

    // --- resolve the entry point -------------------------------------------
    emit({ type: "status", message: "Opening your site in a real browser…" });

    const entryPage = await observeContext.newPage();
    const entryRuntime = collectRuntime(entryPage);
    let entryResponse: Response | null = null;

    try {
      entryResponse = await entryPage.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: NAV_TIMEOUT_MS,
      });
    } catch (error) {
      throw new Error(
        `Could not load the page: ${error instanceof Error ? error.message : error}`
      );
    }

    await entryPage.waitForTimeout(2500);
    const finalUrl = entryPage.url();
    const origin = new URL(finalUrl).origin;

    // --- site-wide checks, done once ---------------------------------------
    emit({ type: "status", message: "Reading security headers and cookies…" });
    record(headerFindings(entryResponse));
    record(await cookieFindings(observeContext, finalUrl));
    record(await httpsRedirectFindings(observeContext, finalUrl));
    record(mixedContentFindings(finalUrl, entryRuntime.resourceUrls));

    emit({ type: "status", message: "Looking for exposed files and source maps…" });
    record(await exposedFileFindings(observeContext, finalUrl));
    record(await sourceMapFindings(observeContext, entryRuntime.scriptUrls));

    emit({ type: "status", message: "Checking robots.txt and sitemap…" });
    record(await siteFileFindings(observeContext, finalUrl));

    await entryPage.close();

    // --- discover pages ----------------------------------------------------
    let pages = [finalUrl];
    let links = new Map<string, DiscoveredLink>();

    if (depth === "site") {
      emit({ type: "status", message: "Mapping your site…" });
      const crawlResult = await crawl(observeContext, {
        startUrl: finalUrl,
        maxPages,
        timeBudgetMs: Math.min(10 * 60_000, deadline - Date.now()),
        onDiscover: (_url, found, queued) => {
          emit({
            type: "status",
            message: `Mapping your site… ${found} page${found === 1 ? "" : "s"} found, ${queued} queued`,
          });
        },
      });
      pages = crawlResult.pages.length > 0 ? crawlResult.pages : [finalUrl];
      links = crawlResult.links;

      emit({
        type: "status",
        message: `Found ${pages.length} page${pages.length === 1 ? "" : "s"}. Auditing each one…`,
      });
    }

    // --- per-page checks ---------------------------------------------------
    let tabStops = 0;

    for (const [index, pageUrl] of pages.entries()) {
      if (Date.now() > deadline) {
        emit({
          type: "status",
          message: "Time budget reached — reporting what we have.",
        });
        break;
      }

      emit({ type: "page", url: pageUrl, index: index + 1, total: pages.length });

      // Runtime behaviour, under the site's real CSP.
      const observePage = await observeContext.newPage();
      const runtime = collectRuntime(observePage);
      try {
        const response = await observePage.goto(pageUrl, {
          waitUntil: "domcontentloaded",
          timeout: NAV_TIMEOUT_MS,
        });
        await observePage.waitForTimeout(2000);

        record(runtimeFindings(runtime, pageUrl), pageUrl);
        record(documentFindings(await readDocumentFacts(observePage)), pageUrl);
        record(await performanceFindings(observePage, response), pageUrl);
      } catch {
        // A page that will not load is already visible as a broken link.
      } finally {
        await observePage.close();
      }

      // Structure and interaction, instrumented.
      const auditPage = await auditContext.newPage();
      try {
        await auditPage.goto(pageUrl, {
          waitUntil: "domcontentloaded",
          timeout: NAV_TIMEOUT_MS,
        });
        await auditPage.waitForTimeout(1500);

        record(await staticA11yFindings(auditPage), pageUrl);

        const keyboard = await keyboardFindings(auditPage);
        tabStops += keyboard.walk.stops.length;
        record(keyboard.findings, pageUrl);
      } catch {
        // Same as above.
      } finally {
        await auditPage.close();
      }

      // Mobile layout.
      record(await responsiveFindings(auditContext, pageUrl), pageUrl);
    }

    // --- link checking, across everything discovered ------------------------
    let linksChecked = 0;
    if (links.size > 0 && Date.now() < deadline) {
      emit({ type: "status", message: `Checking ${links.size} links…` });
      linksChecked = links.size;
      record(
        await checkLinks(observeContext, {
          links,
          origin,
          timeBudgetMs: Math.min(8 * 60_000, deadline - Date.now()),
          onProgress: (checked, total) =>
            emit({
              type: "status",
              message: `Checking links… ${checked} of ${total}`,
            }),
        })
      );
    }

    const merged = sortFindings(mergeFindings(findings));

    const result: ScanResult = {
      url,
      finalUrl,
      scannedAt: new Date().toISOString(),
      depth,
      findings: merged,
      counts: countBySeverity(merged),
      pagesAudited: pages,
      linksChecked,
      tabStops,
      agentPrompt: buildAgentPrompt(finalUrl, merged),
      cssFixes: buildCssFixes(merged),
      durationMs: Date.now() - startedAt,
    };

    emit({ type: "done", result });
    return result;
  } finally {
    await browser?.close();
  }
}
