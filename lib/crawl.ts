import type { BrowserContext } from "playwright-core";

/**
 * Same-origin crawler.
 *
 * A one-page audit is not an audit of a site. Real problems cluster on the pages
 * nobody looks at twice: the settings screen with an unlabelled form, the
 * blog post linking to a page that moved two years ago, the checkout that only
 * breaks on mobile.
 *
 * The crawler is deliberately polite. It stays on one origin, honours
 * robots.txt, limits concurrency, and stops at a page cap and a wall-clock
 * budget. We are auditing a site on its owner's behalf, not stress-testing it.
 */

export interface CrawlOptions {
  startUrl: string;
  maxPages: number;
  /** Wall-clock budget for discovery, in milliseconds. */
  timeBudgetMs: number;
  concurrency?: number;
  onDiscover?: (url: string, found: number, queued: number) => void;
}

export interface DiscoveredLink {
  href: string;
  /** Pages on which this link appears. */
  sources: Set<string>;
  internal: boolean;
}

export interface CrawlResult {
  /** Pages we successfully loaded, in discovery order. */
  pages: string[];
  /** Every link seen anywhere, internal and external. */
  links: Map<string, DiscoveredLink>;
  /** Pages that were queued but never reached (cap or budget hit). */
  skipped: number;
  robotsDisallowed: string[];
}

/** File extensions that are not HTML pages and should never be queued. */
const NON_PAGE = /\.(pdf|zip|tar|gz|png|jpe?g|gif|svg|webp|avif|ico|mp4|webm|mp3|wav|css|js|json|xml|txt|woff2?|ttf|eot)(\?|$)/i;

/**
 * Minimal robots.txt parser: collects Disallow prefixes that apply to `*`.
 *
 * This is not a complete implementation of the standard — it does not handle
 * Allow overrides or wildcards — so it errs toward *not* crawling. Skipping a
 * page we were technically permitted to visit is a much better failure than
 * visiting one we were asked to leave alone.
 */
async function readRobots(
  context: BrowserContext,
  origin: string
): Promise<string[]> {
  try {
    const response = await context.request.get(`${origin}/robots.txt`, {
      timeout: 8000,
      failOnStatusCode: false,
    });
    if (!response.ok()) return [];

    const body = await response.text();
    const disallowed: string[] = [];
    let appliesToUs = false;

    for (const rawLine of body.split("\n")) {
      const line = rawLine.split("#")[0].trim();
      if (!line) continue;

      const [rawKey, ...rest] = line.split(":");
      const key = rawKey.trim().toLowerCase();
      const value = rest.join(":").trim();

      if (key === "user-agent") {
        appliesToUs = value === "*";
      } else if (key === "disallow" && appliesToUs && value) {
        disallowed.push(value);
      }
    }
    return disallowed;
  } catch {
    return [];
  }
}

function normalise(raw: string, base: string): string | null {
  try {
    const url = new URL(raw, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // Fragments are the same document; query strings usually are not.
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export async function crawl(
  context: BrowserContext,
  options: CrawlOptions
): Promise<CrawlResult> {
  const { startUrl, maxPages, timeBudgetMs, concurrency = 3, onDiscover } = options;
  const deadline = Date.now() + timeBudgetMs;

  const start = new URL(startUrl);
  const origin = start.origin;
  const disallowed = await readRobots(context, origin);

  const isAllowed = (url: string) => {
    const path = new URL(url).pathname;
    return !disallowed.some((prefix) => path.startsWith(prefix));
  };

  const pages: string[] = [];
  const links = new Map<string, DiscoveredLink>();
  const seen = new Set<string>([normalise(startUrl, startUrl) ?? startUrl]);
  const queue: string[] = [normalise(startUrl, startUrl) ?? startUrl];
  const robotsDisallowed: string[] = [];

  const recordLink = (href: string, source: string) => {
    const existing = links.get(href);
    if (existing) {
      existing.sources.add(source);
      return;
    }
    links.set(href, {
      href,
      sources: new Set([source]),
      internal: href.startsWith(origin),
    });
  };

  /** Load one page and return the internal URLs worth queueing next. */
  const visit = async (url: string): Promise<string[]> => {
    const page = await context.newPage();
    try {
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });
      if (!response || response.status() >= 400) return [];

      // Only HTML pages have links worth following.
      const type = response.headers()["content-type"] ?? "";
      if (!/text\/html/i.test(type)) return [];

      await page.waitForTimeout(600);

      const hrefs = await page.evaluate(() =>
        Array.from(document.querySelectorAll("a[href]"))
          .map((a) => a.getAttribute("href"))
          .filter((h): h is string => Boolean(h))
      );

      pages.push(url);

      const next: string[] = [];
      for (const href of hrefs) {
        const resolved = normalise(href, url);
        if (!resolved) continue;

        recordLink(resolved, url);

        if (!resolved.startsWith(origin)) continue;
        if (NON_PAGE.test(resolved)) continue;
        if (seen.has(resolved)) continue;

        if (!isAllowed(resolved)) {
          robotsDisallowed.push(resolved);
          seen.add(resolved);
          continue;
        }

        seen.add(resolved);
        next.push(resolved);
      }
      return next;
    } catch {
      return [];
    } finally {
      await page.close();
    }
  };

  // Breadth-first with a small worker pool. Breadth-first matters: it reaches
  // the pages linked from the homepage — the ones real users actually see —
  // before descending into deep archive pages.
  while (queue.length > 0 && pages.length < maxPages && Date.now() < deadline) {
    const batch = queue.splice(0, Math.min(concurrency, maxPages - pages.length));
    const results = await Promise.all(batch.map(visit));

    for (const found of results) {
      for (const url of found) queue.push(url);
    }

    onDiscover?.(batch[batch.length - 1] ?? "", pages.length, queue.length);
  }

  return {
    pages,
    links,
    skipped: queue.length,
    robotsDisallowed,
  };
}
