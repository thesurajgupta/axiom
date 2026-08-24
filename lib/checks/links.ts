import type { BrowserContext } from "playwright-core";
import type { DiscoveredLink } from "../crawl";
import type { Finding } from "../findings";

/**
 * Link checking across the whole site.
 *
 * This is the slowest check by a wide margin and it is worth every second. Dead
 * links are the most common defect on any site that has existed for more than a
 * year, they are invisible to the people who work on it daily, and no amount of
 * reading source code will find them — you have to make the request.
 *
 * We check each unique URL once, no matter how many pages link to it, and
 * report the sources so the fix is a search-and-replace rather than a hunt.
 */

export interface LinkCheckOptions {
  links: Map<string, DiscoveredLink>;
  origin: string;
  timeBudgetMs: number;
  concurrency?: number;
  onProgress?: (checked: number, total: number) => void;
}

interface BrokenLink {
  href: string;
  status: number | string;
  sources: string[];
  internal: boolean;
}

/**
 * Sites that reliably reject automated HEAD/GET requests with 403 or 999.
 * Reporting these as broken would be a false positive — the link works fine in
 * a browser, the server simply refuses robots.
 */
const BOT_HOSTILE = /(linkedin\.com|x\.com|twitter\.com|facebook\.com|instagram\.com|medium\.com|reddit\.com)/i;

export async function checkLinks(
  context: BrowserContext,
  options: LinkCheckOptions
): Promise<Finding[]> {
  const { links, origin, timeBudgetMs, concurrency = 6, onProgress } = options;
  const deadline = Date.now() + timeBudgetMs;

  const targets = [...links.values()];
  const broken: BrokenLink[] = [];
  let checked = 0;

  const checkOne = async (link: DiscoveredLink) => {
    if (Date.now() > deadline) return;

    const host = (() => {
      try {
        return new URL(link.href).host;
      } catch {
        return "";
      }
    })();

    if (!link.internal && BOT_HOSTILE.test(host)) return;

    try {
      // HEAD first: cheaper for us and lighter on their server. Many servers
      // answer HEAD with 405, so fall back to GET before believing a failure.
      let response = await context.request.head(link.href, {
        timeout: 12_000,
        failOnStatusCode: false,
        maxRedirects: 5,
      });

      if (response.status() === 405 || response.status() === 501) {
        response = await context.request.get(link.href, {
          timeout: 12_000,
          failOnStatusCode: false,
          maxRedirects: 5,
        });
      }

      const status = response.status();
      // 401 and 403 mean the link resolves but is protected, which is usually
      // intentional. Only genuine "this is not here" and server faults count.
      if (status === 404 || status === 410 || status >= 500) {
        broken.push({
          href: link.href,
          status,
          sources: [...link.sources],
          internal: link.internal,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unreachable";
      // Only report connection failures for our own pages. External hosts fail
      // for a hundred transient reasons we should not blame the developer for.
      if (link.internal) {
        broken.push({
          href: link.href,
          status: message.slice(0, 60),
          sources: [...link.sources],
          internal: true,
        });
      }
    } finally {
      checked++;
      if (checked % 10 === 0) onProgress?.(checked, targets.length);
    }
  };

  for (let i = 0; i < targets.length; i += concurrency) {
    if (Date.now() > deadline) break;
    await Promise.all(targets.slice(i, i + concurrency).map(checkOne));
  }

  if (broken.length === 0) return [];

  const findings: Finding[] = [];
  const internal = broken.filter((b) => b.internal);
  const external = broken.filter((b) => !b.internal);

  const describe = (link: BrokenLink) =>
    `${short(link.href, origin)} → ${link.status}\n    linked from ${short(link.sources[0], origin)}` +
    (link.sources.length > 1 ? ` and ${link.sources.length - 1} other page(s)` : "");

  if (internal.length > 0) {
    findings.push({
      id: "broken-internal-link",
      category: "bug",
      severity: "serious",
      title: `${internal.length} internal link${internal.length === 1 ? " leads" : "s lead"} nowhere`,
      detail:
        "These point at pages on your own site that do not exist. Every one is a " +
        "visitor hitting a 404 in the middle of your product, and search engines " +
        "treat broken internal links as a quality signal.",
      evidence: internal.slice(0, 8).map(describe).join("\n"),
      count: internal.length,
      fix:
        "Update the href, or add a redirect if the page moved. The 'linked from' " +
        "line tells you which page to edit.",
    });
  }

  if (external.length > 0) {
    findings.push({
      id: "broken-external-link",
      category: "bug",
      severity: "moderate",
      title: `${external.length} outbound link${external.length === 1 ? " is" : "s are"} dead`,
      detail:
        "These point at other sites that returned 404 or an error. It reflects on " +
        "you rather than on them — a visitor who clicks one concludes your site " +
        "is unmaintained.",
      evidence: external.slice(0, 8).map(describe).join("\n"),
      count: external.length,
      fix: "Update or remove them. Check archive.org if the content moved.",
    });
  }

  return findings;
}

function short(url: string, origin: string): string {
  try {
    const u = new URL(url);
    return u.origin === origin ? u.pathname + u.search : url;
  } catch {
    return url;
  }
}
