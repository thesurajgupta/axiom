import type { BrowserContext, Page } from "playwright-core";
import type { Finding } from "../findings";

/**
 * Launch-readiness checks.
 *
 * These are the things that are almost never wrong in a hand-built site and
 * almost always wrong in a generated one, because they live outside the part of
 * the app you actually look at. Nobody notices there is no og:image until the
 * first person shares the link and it renders as a grey box.
 */

interface DocumentFacts {
  title: string | null;
  description: string | null;
  viewport: string | null;
  canonical: string | null;
  ogTitle: string | null;
  ogImage: string | null;
  ogDescription: string | null;
  favicon: string | null;
  lang: string | null;
  h1Count: number;
  noindex: boolean;
}

export async function readDocumentFacts(page: Page): Promise<DocumentFacts> {
  return page.evaluate(() => {
    const meta = (selector: string) =>
      document.querySelector(selector)?.getAttribute("content")?.trim() || null;

    const robots = meta('meta[name="robots"]') ?? "";

    return {
      title: document.title?.trim() || null,
      description: meta('meta[name="description"]'),
      viewport: meta('meta[name="viewport"]'),
      canonical:
        document.querySelector('link[rel="canonical"]')?.getAttribute("href") ||
        null,
      ogTitle: meta('meta[property="og:title"]'),
      ogImage: meta('meta[property="og:image"]'),
      ogDescription: meta('meta[property="og:description"]'),
      favicon:
        document
          .querySelector('link[rel~="icon"], link[rel="shortcut icon"]')
          ?.getAttribute("href") || null,
      lang: document.documentElement.getAttribute("lang"),
      h1Count: document.querySelectorAll("h1").length,
      noindex: /noindex/i.test(robots),
    };
  });
}

export function documentFindings(facts: DocumentFacts): Finding[] {
  const findings: Finding[] = [];

  // A generated site left in noindex is invisible to search entirely, and the
  // team usually does not discover it for weeks.
  if (facts.noindex) {
    findings.push({
      id: "noindex",
      category: "seo",
      severity: "blocker",
      title: "Search engines are being told to ignore this page",
      detail:
        "There is a noindex directive on the page. Google will not list it at " +
        "all. This is nearly always a staging setting that shipped to production " +
        "by accident.",
      evidence: '<meta name="robots" content="noindex">',
      fix: "Remove the noindex meta tag if this page is meant to be public.",
    });
  }

  if (!facts.title) {
    findings.push({
      id: "missing-title",
      category: "seo",
      severity: "serious",
      title: "The page has no title",
      detail:
        "The title is what appears in the browser tab, the search result, and " +
        "the bookmark. It is also the first thing a screen reader announces on " +
        "page load, so its absence is both a search and an accessibility problem.",
      fix: "Add a descriptive <title>. Aim for 50–60 characters.",
      snippet: {
        language: "html",
        code: "<title>Your Product — what it does in a few words</title>",
      },
    });
  }

  if (!facts.description) {
    findings.push({
      id: "missing-description",
      category: "seo",
      severity: "moderate",
      title: "No meta description",
      detail:
        "Without one, Google invents a snippet by scraping text from your page. " +
        "It usually picks badly. This is the pitch that decides whether someone " +
        "clicks your result or a competitor's.",
      fix: "Add a meta description of roughly 150–160 characters.",
      snippet: {
        language: "html",
        code: '<meta name="description" content="One clear sentence about what this page offers.">',
      },
    });
  }

  if (!facts.ogImage || !facts.ogTitle) {
    const missing = [
      !facts.ogTitle && "og:title",
      !facts.ogDescription && "og:description",
      !facts.ogImage && "og:image",
    ].filter(Boolean);

    findings.push({
      id: "missing-og",
      category: "seo",
      severity: "moderate",
      title: "Links to your site will look broken when shared",
      detail:
        "Open Graph tags control the preview card on WhatsApp, Slack, LinkedIn, " +
        "iMessage and X. Without them your link renders as bare text or a grey " +
        "box, which measurably reduces the number of people who click it.",
      evidence: `Missing: ${missing.join(", ")}`,
      fix: "Add Open Graph tags. The image should be 1200×630.",
      snippet: {
        language: "html",
        code:
          '<meta property="og:title" content="Your Product">\n' +
          '<meta property="og:description" content="What it does.">\n' +
          '<meta property="og:image" content="https://yoursite.com/og.png">\n' +
          '<meta name="twitter:card" content="summary_large_image">',
      },
    });
  }

  if (!facts.viewport) {
    findings.push({
      id: "missing-viewport",
      category: "seo",
      severity: "serious",
      title: "The site is not set up for mobile",
      detail:
        "Without a viewport meta tag, phones render the page at desktop width " +
        "and zoom out. Text becomes unreadable and everything needs pinching. " +
        "Most of your traffic is probably mobile.",
      fix: "Add the viewport meta tag.",
      snippet: {
        language: "html",
        code: '<meta name="viewport" content="width=device-width, initial-scale=1">',
      },
    });
  }

  if (facts.h1Count === 0) {
    findings.push({
      id: "missing-h1",
      category: "seo",
      severity: "moderate",
      title: "No main heading on the page",
      detail:
        "Screen-reader users navigate by jumping between headings, and search " +
        "engines use the h1 to understand what the page is about. Styling a div " +
        "to look big is not the same thing.",
      fix: "Give the page exactly one <h1> describing what it is.",
    });
  } else if (facts.h1Count > 1) {
    findings.push({
      id: "multiple-h1",
      category: "seo",
      severity: "minor",
      title: `Page has ${facts.h1Count} main headings`,
      detail:
        "Multiple h1 elements make the document outline ambiguous for assistive " +
        "technology and search crawlers.",
      fix: "Keep one <h1> and demote the rest to <h2>.",
    });
  }

  if (!facts.favicon) {
    findings.push({
      id: "missing-favicon",
      category: "seo",
      severity: "minor",
      title: "No favicon",
      detail:
        "Your tab shows a blank page icon. It is small, but it is the difference " +
        "between looking shipped and looking like a prototype.",
      fix: "Add a favicon.",
      snippet: {
        language: "html",
        code: '<link rel="icon" href="/favicon.ico" sizes="any">',
      },
    });
  }

  return findings;
}

/**
 * robots.txt and sitemap.xml. Both are conventional well-known paths that
 * crawlers request on their own, so asking for them is ordinary traffic.
 */
export async function siteFileFindings(
  context: BrowserContext,
  pageUrl: string
): Promise<Finding[]> {
  let origin: string;
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    return [];
  }

  const findings: Finding[] = [];

  const fetchPath = async (path: string) => {
    try {
      const response = await context.request.get(origin + path, {
        timeout: 8000,
        failOnStatusCode: false,
      });
      if (!response.ok()) return null;
      const type = response.headers()["content-type"] ?? "";
      // SPA catch-alls return index.html for anything; that is not a real file.
      if (/text\/html/i.test(type)) return null;
      return (await response.text()).slice(0, 4000);
    } catch {
      return null;
    }
  };

  const [robots, sitemap] = await Promise.all([
    fetchPath("/robots.txt"),
    fetchPath("/sitemap.xml"),
  ]);

  if (robots === null) {
    findings.push({
      id: "missing-robots",
      category: "seo",
      severity: "minor",
      title: "No robots.txt",
      detail:
        "Crawlers request this file first on every visit. Without it you have no " +
        "way to keep them out of admin or API routes, and no place to point them " +
        "at your sitemap.",
      fix: "Add a robots.txt at the root of your domain.",
      snippet: {
        language: "text",
        code: `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml`,
      },
    });
  } else if (/^\s*Disallow:\s*\/\s*$/m.test(robots)) {
    findings.push({
      id: "robots-blocks-all",
      category: "seo",
      severity: "blocker",
      title: "robots.txt is blocking your entire site from search engines",
      detail:
        "The file contains a rule that disallows everything. No search engine " +
        "will index any page. This is almost always left over from staging.",
      evidence: "Disallow: /",
      location: `${origin}/robots.txt`,
      fix: "Remove the blanket Disallow rule if this site should be indexed.",
    });
  }

  if (sitemap === null) {
    findings.push({
      id: "missing-sitemap",
      category: "seo",
      severity: "minor",
      title: "No sitemap.xml",
      detail:
        "A sitemap tells search engines which pages exist and when they changed. " +
        "Without one, discovery relies entirely on crawling your internal links, " +
        "which is slower and misses pages that are not linked from anywhere.",
      fix:
        "Generate a sitemap. Most frameworks do this for you — in Next.js, add " +
        "an app/sitemap.ts file.",
    });
  }

  return findings;
}
