import type { Page, Response } from "playwright-core";
import type { Finding } from "../findings";

/**
 * Checks that observe the page *while it runs*.
 *
 * These are the findings developers care about most, because they are not style
 * opinions — they are things that are already broken in production. A 500 from
 * your own API on page load is not a warning, it is a bug that shipped.
 *
 * All of it comes from simply watching the browser do what it was going to do
 * anyway. Nothing here probes, attacks, or sends traffic the page did not
 * already intend to send.
 */

export interface RuntimeCollector {
  /** Every resource URL the page requested, for source-map and mixed-content checks. */
  resourceUrls: string[];
  scriptUrls: string[];
  consoleErrors: Array<{ text: string; location: string }>;
  pageErrors: string[];
  failedRequests: Array<{
    url: string;
    method: string;
    status: number | null;
    failure: string | null;
    resourceType: string;
  }>;
}

/**
 * Attach listeners before navigation. Must be called prior to page.goto or the
 * earliest (and usually most interesting) errors are missed.
 */
export function collectRuntime(page: Page): RuntimeCollector {
  const collector: RuntimeCollector = {
    resourceUrls: [],
    scriptUrls: [],
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
  };

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const loc = message.location();
    collector.consoleErrors.push({
      text: message.text().slice(0, 300),
      location: loc.url ? `${loc.url}:${loc.lineNumber}` : "",
    });
  });

  // Uncaught exceptions are strictly worse than console.error: something threw
  // and nobody handled it.
  page.on("pageerror", (error) => {
    collector.pageErrors.push(String(error.message ?? error).slice(0, 300));
  });

  page.on("requestfailed", (request) => {
    collector.failedRequests.push({
      url: request.url(),
      method: request.method(),
      status: null,
      failure: request.failure()?.errorText ?? "request failed",
      resourceType: request.resourceType(),
    });
  });

  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return;
    collector.resourceUrls.push(url);
    if (request.resourceType() === "script") collector.scriptUrls.push(url);
  });

  page.on("response", (response) => {
    const status = response.status();
    if (status < 400) return;
    const request = response.request();
    collector.failedRequests.push({
      url: response.url(),
      method: request.method(),
      status,
      failure: null,
      resourceType: request.resourceType(),
    });
  });

  return collector;
}

/** Shorten a URL for display without losing the part that identifies it. */
function short(url: string, origin: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    return u.origin === origin ? path : u.origin + path;
  } catch {
    return url;
  }
}

export function runtimeFindings(
  collector: RuntimeCollector,
  pageUrl: string
): Finding[] {
  const findings: Finding[] = [];
  const origin = (() => {
    try {
      return new URL(pageUrl).origin;
    } catch {
      return "";
    }
  })();

  // --- uncaught exceptions ------------------------------------------------
  if (collector.pageErrors.length > 0) {
    const unique = [...new Set(collector.pageErrors)];
    findings.push({
      id: "runtime-exception",
      category: "bug",
      severity: "blocker",
      title: `JavaScript crashed while your page was loading`,
      detail:
        "An uncaught exception was thrown during page load. Whatever code came " +
        "after the throw did not run, so part of your page is silently dead — " +
        "and it will be dead for every visitor, not just some of them.",
      evidence: unique.slice(0, 3).join("\n"),
      count: unique.length,
      fix:
        "Reproduce it with your browser console open and fix the throw. If the " +
        "failing code is non-essential, wrap it so one broken feature cannot " +
        "take down the rest of the page.",
    });
  }

  // --- failed API calls ---------------------------------------------------
  // Separated from other resources because a broken API is a product bug,
  // while a broken image is a content bug. They deserve different urgency.
  const apiFailures = collector.failedRequests.filter(
    (r) =>
      r.resourceType === "fetch" ||
      r.resourceType === "xhr" ||
      /\/api\//.test(r.url)
  );

  if (apiFailures.length > 0) {
    const serverErrors = apiFailures.filter((r) => (r.status ?? 0) >= 500);
    findings.push({
      id: "api-failure",
      category: "bug",
      severity: serverErrors.length > 0 ? "blocker" : "serious",
      title:
        serverErrors.length > 0
          ? "Your own API is returning server errors"
          : "API requests are failing on page load",
      detail:
        serverErrors.length > 0
          ? "An endpoint your page depends on returned a 5xx. That is your " +
            "server failing, not the user's connection — every visitor hits this."
          : "Requests your page makes during load are not completing. Anything " +
            "that depends on this data will render empty or stale.",
      evidence: apiFailures
        .slice(0, 5)
        .map(
          (r) =>
            `${r.method} ${short(r.url, origin)} → ${r.status ?? r.failure}`
        )
        .join("\n"),
      count: apiFailures.length,
      fix:
        "Check your server logs for these routes. If the endpoint is expected " +
        "to fail sometimes, handle the error path in the client so the UI " +
        "degrades instead of breaking.",
    });
  }

  // --- other broken resources --------------------------------------------
  const assetFailures = collector.failedRequests.filter(
    (r) => !apiFailures.includes(r)
  );

  if (assetFailures.length > 0) {
    findings.push({
      id: "broken-resource",
      category: "bug",
      severity: "moderate",
      title: `${assetFailures.length} file${assetFailures.length === 1 ? "" : "s"} failed to load`,
      detail:
        "Images, scripts or stylesheets returned an error. Missing scripts and " +
        "stylesheets change how the page behaves and looks; missing images just " +
        "leave holes.",
      evidence: assetFailures
        .slice(0, 5)
        .map((r) => `${short(r.url, origin)} → ${r.status ?? r.failure}`)
        .join("\n"),
      count: assetFailures.length,
      fix: "Fix the paths, or remove the references if the files are gone.",
    });
  }

  // --- console errors -----------------------------------------------------
  if (collector.consoleErrors.length > 0) {
    const unique = [...new Set(collector.consoleErrors.map((e) => e.text))];
    findings.push({
      id: "console-error",
      category: "bug",
      severity: "moderate",
      title: `${unique.length} error${unique.length === 1 ? "" : "s"} logged to the console`,
      detail:
        "Your code is reporting problems that nobody is reading. These are " +
        "often the first visible symptom of a bug that shows up as something " +
        "else entirely later.",
      evidence: unique.slice(0, 4).join("\n"),
      count: unique.length,
      fix: "Work through them from the top. The first error frequently causes the rest.",
    });
  }

  return findings;
}

/**
 * Performance, measured from the browser's own navigation timing rather than a
 * synthetic score. We report what the user experiences: how long until the page
 * showed something, and how much was shipped to achieve it.
 */
export async function performanceFindings(
  page: Page,
  response: Response | null
): Promise<Finding[]> {
  const findings: Finding[] = [];

  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;

    const paints = performance.getEntriesByType("paint");
    const fcp = paints.find((p) => p.name === "first-contentful-paint")?.startTime;

    const resources = performance.getEntriesByType(
      "resource"
    ) as PerformanceResourceTiming[];
    const transferred = resources.reduce((sum, r) => sum + (r.transferSize || 0), 0);

    return {
      domContentLoaded: nav?.domContentLoadedEventEnd ?? null,
      loadComplete: nav?.loadEventEnd ?? null,
      fcp: fcp ?? null,
      requestCount: resources.length,
      transferredBytes: transferred,
    };
  });

  const mb = metrics.transferredBytes / (1024 * 1024);

  if (metrics.fcp !== null && metrics.fcp > 3000) {
    findings.push({
      id: "slow-first-paint",
      category: "performance",
      severity: metrics.fcp > 6000 ? "serious" : "moderate",
      title: `Page takes ${(metrics.fcp / 1000).toFixed(1)}s to show anything`,
      detail:
        "First Contentful Paint is the moment the user stops staring at a blank " +
        "screen. Google's threshold for 'good' is 1.8s. Past about 3s, people " +
        "start leaving before they have seen your product at all.",
      evidence: `First Contentful Paint: ${Math.round(metrics.fcp)}ms`,
      fix:
        "Usually this is render-blocking JavaScript or webfonts. Defer scripts " +
        "that are not needed for the first render, and use font-display: swap.",
    });
  }

  if (mb > 3) {
    findings.push({
      id: "heavy-page",
      category: "performance",
      severity: mb > 8 ? "serious" : "moderate",
      title: `Page downloads ${mb.toFixed(1)} MB`,
      detail:
        "On a mid-range phone over mobile data this is slow and expensive. Most " +
        "of the weight in a page this size is uncompressed images or a bundle " +
        "that shipped code the first screen never uses.",
      evidence: `${metrics.requestCount} requests, ${mb.toFixed(1)} MB transferred`,
      fix:
        "Convert large images to WebP/AVIF and serve them at display size. Then " +
        "check your bundle for dependencies that could be lazily imported.",
    });
  }

  // Compression is a one-line server change with a large payoff, so its absence
  // is worth calling out specifically rather than folding into page weight.
  const encoding = response?.headers()["content-encoding"];
  if (!encoding && (response?.status() ?? 0) < 400) {
    findings.push({
      id: "no-compression",
      category: "performance",
      severity: "moderate",
      title: "Your HTML is being sent uncompressed",
      detail:
        "The server is not gzipping or brotli-compressing the response. Text " +
        "compresses by roughly 70%, so this is one of the cheapest speed wins " +
        "available.",
      evidence: "No content-encoding header on the main document",
      fix:
        "Enable compression in your server or CDN. On Vercel, Netlify and " +
        "Cloudflare this is on by default — if it is missing, something is " +
        "serving the page directly.",
    });
  }

  return findings;
}
