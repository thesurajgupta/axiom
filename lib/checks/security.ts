import type { BrowserContext, Response } from "playwright-core";
import type { Finding } from "../findings";

/**
 * Security checks that are observable from outside, without attacking anything.
 *
 * This file is deliberately conservative about what it claims. You cannot test
 * rate limiting, authentication logic, or payment handling from a URL — doing so
 * would mean sending hostile traffic at a server you may not own, which is both
 * unreliable and, in most jurisdictions, illegal.
 *
 * What you *can* do is read what the server volunteers: its response headers,
 * the flags on the cookies it sets, and whether files that should never be
 * public are being served. Those are real, high-value findings with a
 * copy-pasteable fix, and none of them require sending a single request the
 * browser was not already going to send.
 */

interface HeaderRule {
  header: string;
  severity: Finding["severity"];
  title: string;
  detail: string;
  fix: string;
  snippet?: { language: string; code: string };
  /** Some headers are satisfied by an alternative (CSP can replace XFO). */
  satisfiedBy?: (headers: Record<string, string>) => boolean;
  docsUrl?: string;
}

const HEADER_RULES: HeaderRule[] = [
  {
    header: "content-security-policy",
    severity: "serious",
    title: "No Content Security Policy",
    detail:
      "A CSP is the main defence against cross-site scripting. Without one, any " +
      "script that reaches your page — through a comment field, a dependency, a " +
      "compromised third-party tag — runs with full access to your users' " +
      "sessions.",
    fix:
      "Add a CSP. Start in report-only mode so you can see what would break " +
      "before you enforce it.",
    snippet: {
      language: "http",
      code: "Content-Security-Policy: default-src 'self'; img-src 'self' data: https:; script-src 'self'",
    },
    docsUrl: "https://developer.mozilla.org/docs/Web/HTTP/Headers/Content-Security-Policy",
  },
  {
    header: "strict-transport-security",
    severity: "serious",
    title: "HSTS is not enabled",
    detail:
      "Without HSTS, a user's first request can be downgraded to plain HTTP and " +
      "intercepted before your redirect to HTTPS ever happens. HSTS tells the " +
      "browser to refuse HTTP for your domain entirely.",
    fix: "Send HSTS on every HTTPS response.",
    snippet: {
      language: "http",
      code: "Strict-Transport-Security: max-age=31536000; includeSubDomains",
    },
    docsUrl: "https://developer.mozilla.org/docs/Web/HTTP/Headers/Strict-Transport-Security",
  },
  {
    header: "x-frame-options",
    severity: "serious",
    title: "Your site can be embedded in an iframe",
    detail:
      "An attacker can load your page invisibly on top of their own and trick " +
      "users into clicking your buttons — clickjacking. This matters most on " +
      "pages with a purchase, a delete, or a permissions change.",
    fix: "Block framing with either header below.",
    snippet: {
      language: "http",
      code: "X-Frame-Options: DENY\n# or, preferably, via CSP:\nContent-Security-Policy: frame-ancestors 'none'",
    },
    satisfiedBy: (h) => /frame-ancestors/i.test(h["content-security-policy"] ?? ""),
    docsUrl: "https://developer.mozilla.org/docs/Web/HTTP/Headers/X-Frame-Options",
  },
  {
    header: "x-content-type-options",
    severity: "moderate",
    title: "Browsers are allowed to guess your file types",
    detail:
      "Without nosniff, a browser may decide that a file you serve as text is " +
      "actually a script and execute it. This turns an innocuous upload endpoint " +
      "into a way to run code on your domain.",
    fix: "One header, no downside.",
    snippet: { language: "http", code: "X-Content-Type-Options: nosniff" },
    docsUrl: "https://developer.mozilla.org/docs/Web/HTTP/Headers/X-Content-Type-Options",
  },
  {
    header: "referrer-policy",
    severity: "minor",
    title: "Full URLs leak to other sites",
    detail:
      "By default, clicking an external link sends your full URL — including any " +
      "path or query string — to that site. If your URLs contain ids, tokens or " +
      "search terms, those go with it.",
    fix: "Send only the origin to third parties.",
    snippet: {
      language: "http",
      code: "Referrer-Policy: strict-origin-when-cross-origin",
    },
    docsUrl: "https://developer.mozilla.org/docs/Web/HTTP/Headers/Referrer-Policy",
  },
];

/** Headers that disclose your stack to anyone scanning for known CVEs. */
const DISCLOSURE_HEADERS = ["x-powered-by", "server", "x-aspnet-version"];

export function headerFindings(response: Response | null): Finding[] {
  if (!response) return [];

  const headers = response.headers();
  const findings: Finding[] = [];
  const isHttps = response.url().startsWith("https://");

  for (const rule of HEADER_RULES) {
    // HSTS is meaningless over plain HTTP; don't report noise.
    if (rule.header === "strict-transport-security" && !isHttps) continue;
    if (headers[rule.header]) continue;
    if (rule.satisfiedBy?.(headers)) continue;

    findings.push({
      id: `header-${rule.header}`,
      category: "security",
      severity: rule.severity,
      title: rule.title,
      detail: rule.detail,
      evidence: `Response header "${rule.header}" is not set`,
      location: response.url(),
      fix: rule.fix,
      snippet: rule.snippet,
      docsUrl: rule.docsUrl,
    });
  }

  const disclosed = DISCLOSURE_HEADERS.filter((h) => headers[h]).map(
    (h) => `${h}: ${headers[h]}`
  );

  if (disclosed.length > 0) {
    findings.push({
      id: "header-disclosure",
      category: "security",
      severity: "minor",
      title: "Your server is announcing what software it runs",
      detail:
        "These headers tell an attacker exactly which stack and version to look " +
        "up known vulnerabilities for. It costs nothing to remove them.",
      evidence: disclosed.join("\n"),
      fix: "Strip these headers at your server or proxy layer.",
    });
  }

  return findings;
}

export async function cookieFindings(
  context: BrowserContext,
  pageUrl: string
): Promise<Finding[]> {
  const cookies = await context.cookies(pageUrl);
  if (cookies.length === 0) return [];

  const isHttps = pageUrl.startsWith("https://");

  const insecure = cookies.filter((c) => isHttps && !c.secure);
  const readable = cookies.filter((c) => !c.httpOnly);
  const noSameSite = cookies.filter(
    (c) => !c.sameSite || c.sameSite === "None"
  );

  const findings: Finding[] = [];

  if (insecure.length > 0) {
    findings.push({
      id: "cookie-insecure",
      category: "security",
      severity: "serious",
      title: `${insecure.length} cookie${insecure.length === 1 ? "" : "s"} can be sent over plain HTTP`,
      detail:
        "Without the Secure flag, the browser will send these cookies over an " +
        "unencrypted connection, where anyone on the same network can read them. " +
        "If one of these is a session cookie, that is account takeover.",
      evidence: insecure.map((c) => c.name).join(", "),
      fix: "Set the Secure flag when creating these cookies.",
      snippet: {
        language: "http",
        code: "Set-Cookie: session=...; Secure; HttpOnly; SameSite=Lax",
      },
    });
  }

  if (readable.length > 0) {
    findings.push({
      id: "cookie-not-httponly",
      category: "security",
      severity: "serious",
      title: `${readable.length} cookie${readable.length === 1 ? "" : "s"} readable by JavaScript`,
      detail:
        "Any script on the page can read these with document.cookie. That " +
        "includes a script injected through an XSS bug or shipped inside a " +
        "compromised dependency. HttpOnly makes session theft much harder.",
      evidence: readable.map((c) => c.name).join(", "),
      fix:
        "Add HttpOnly to any cookie your client-side code does not genuinely " +
        "need to read — which is almost always all of them.",
    });
  }

  if (noSameSite.length > 0) {
    findings.push({
      id: "cookie-samesite",
      category: "security",
      severity: "moderate",
      title: `${noSameSite.length} cookie${noSameSite.length === 1 ? "" : "s"} without SameSite protection`,
      detail:
        "SameSite stops the browser attaching your cookies to requests that " +
        "originate from another site, which is the basis of cross-site request " +
        "forgery — an attacker's page making authenticated calls as your user.",
      evidence: noSameSite.map((c) => c.name).join(", "),
      fix: "Set SameSite=Lax unless you have a specific cross-site need.",
    });
  }

  return findings;
}

/**
 * Files that should never be publicly served.
 *
 * We issue a plain GET for each — the same request any browser could make — and
 * only report a hit when the response both succeeds and *looks like the real
 * file*. That content check matters: single-page apps commonly return 200 with
 * index.html for every unknown path, so status alone produces false positives on
 * a large share of modern sites.
 *
 * We never read, store, or transmit the contents beyond this signature test.
 */
const SENSITIVE_PATHS: Array<{
  path: string;
  label: string;
  signature: RegExp;
  severity: Finding["severity"];
}> = [
  {
    path: "/.env",
    label: "Environment file",
    signature: /^\s*[A-Z0-9_]+\s*=/m,
    severity: "blocker",
  },
  {
    path: "/.git/config",
    label: "Git repository config",
    signature: /\[core\]|\[remote /,
    severity: "blocker",
  },
  {
    path: "/.env.local",
    label: "Local environment file",
    signature: /^\s*[A-Z0-9_]+\s*=/m,
    severity: "blocker",
  },
  {
    path: "/config.json",
    label: "Configuration file",
    signature: /"(api[_-]?key|secret|password|token)"/i,
    severity: "serious",
  },
  {
    path: "/.aws/credentials",
    label: "AWS credentials",
    signature: /aws_access_key_id/i,
    severity: "blocker",
  },
];

export async function exposedFileFindings(
  context: BrowserContext,
  pageUrl: string
): Promise<Finding[]> {
  let origin: string;
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    return [];
  }

  const request = context.request;
  const exposed: Array<{ path: string; label: string; severity: Finding["severity"] }> = [];

  await Promise.all(
    SENSITIVE_PATHS.map(async ({ path, label, signature, severity }) => {
      try {
        const response = await request.get(origin + path, {
          timeout: 8000,
          failOnStatusCode: false,
          maxRedirects: 0,
        });
        if (!response.ok()) return;

        // Reject SPA catch-all responses before looking at content at all.
        const type = response.headers()["content-type"] ?? "";
        if (/text\/html/i.test(type)) return;

        const body = (await response.text()).slice(0, 2000);
        if (!signature.test(body)) return;

        exposed.push({ path, label, severity });
      } catch {
        // Timeouts and connection errors mean "not reachable", which is the
        // outcome we want anyway.
      }
    })
  );

  if (exposed.length === 0) return [];

  const worst = exposed.some((e) => e.severity === "blocker")
    ? "blocker"
    : "serious";

  return [
    {
      id: "exposed-file",
      category: "security",
      severity: worst as Finding["severity"],
      title: `${exposed.length} sensitive file${exposed.length === 1 ? " is" : "s are"} publicly downloadable`,
      detail:
        "Anyone on the internet can fetch these right now. Environment files and " +
        "git configs routinely contain database URLs, API keys and deploy " +
        "credentials. Treat any secret in them as already compromised.",
      evidence: exposed.map((e) => `${e.path} — ${e.label}`).join("\n"),
      location: origin,
      fix:
        "Block these paths at your server or CDN immediately, then rotate every " +
        "credential they contained. Deleting the file is not enough if it has " +
        "been public — assume it was read.",
    },
  ];
}

/**
 * Publicly readable source maps.
 *
 * A .map file contains your original, unminified source — comments, variable
 * names, sometimes entire files that were never meant to ship. Build tools emit
 * them by default and deploy pipelines routinely upload them alongside the
 * bundle, so this is one of the most common accidental disclosures on the web
 * and almost nobody checks for it.
 */
export async function sourceMapFindings(
  context: BrowserContext,
  scriptUrls: string[]
): Promise<Finding[]> {
  const candidates = [...new Set(scriptUrls)]
    .filter((u) => /\.js(\?|$)/i.test(u))
    .slice(0, 12);

  if (candidates.length === 0) return [];

  const exposed: string[] = [];

  await Promise.all(
    candidates.map(async (scriptUrl) => {
      try {
        const script = await context.request.get(scriptUrl, {
          timeout: 10_000,
          failOnStatusCode: false,
        });
        if (!script.ok()) return;

        const body = await script.text();
        const match = body.match(/\/\/[#@]\s*sourceMappingURL=(\S+)/);
        if (!match) return;

        const mapRef = match[1];
        // Inline data: maps are already in the bundle; nothing further to leak.
        if (mapRef.startsWith("data:")) return;

        const mapUrl = new URL(mapRef, scriptUrl).toString();
        const map = await context.request.get(mapUrl, {
          timeout: 10_000,
          failOnStatusCode: false,
        });
        if (!map.ok()) return;

        const preview = (await map.text()).slice(0, 400);
        if (!/"sources"\s*:/.test(preview) && !/"mappings"\s*:/.test(preview)) return;

        exposed.push(mapUrl);
      } catch {
        // Unreachable means not exposed, which is the outcome we want.
      }
    })
  );

  if (exposed.length === 0) return [];

  return [
    {
      id: "exposed-sourcemap",
      category: "security",
      severity: "moderate",
      title: `${exposed.length} source map${exposed.length === 1 ? " is" : "s are"} publicly downloadable`,
      detail:
        "Anyone can reconstruct your original source from these — comments, " +
        "internal variable names, file structure, and any API endpoint or key " +
        "that ended up in your client bundle. Minification stops being a barrier.",
      evidence: exposed.slice(0, 5).join("\n"),
      fix:
        "Stop shipping maps to production, or upload them to your error tracker " +
        "and block the path publicly. In Next.js set productionBrowserSourceMaps " +
        "to false; in Vite set build.sourcemap to false.",
    },
  ];
}

/**
 * Whether plain HTTP actually redirects to HTTPS.
 *
 * Most people assume it does because they only ever type the https:// URL.
 * Users type the bare domain, and if the http:// version serves content rather
 * than redirecting, everything they send on that first request is in the clear.
 */
export async function httpsRedirectFindings(
  context: BrowserContext,
  pageUrl: string
): Promise<Finding[]> {
  if (!pageUrl.startsWith("https://")) return [];

  const httpUrl = "http://" + new URL(pageUrl).host + "/";

  try {
    const response = await context.request.get(httpUrl, {
      timeout: 10_000,
      failOnStatusCode: false,
      maxRedirects: 0,
    });

    const status = response.status();
    const location = response.headers()["location"] ?? "";

    const redirectsToHttps =
      status >= 300 && status < 400 && location.startsWith("https://");

    if (redirectsToHttps) return [];

    return [
      {
        id: "no-https-redirect",
        category: "security",
        severity: "serious",
        title: "Plain HTTP does not redirect to HTTPS",
        detail:
          "Someone typing your domain without the protocol gets an unencrypted " +
          "connection. Anything sent on that request — a login, a session " +
          "cookie — is readable by anyone on the same network.",
        evidence: `GET ${httpUrl} → ${status}${location ? ` (Location: ${location})` : " (no redirect)"}`,
        fix:
          "Add a permanent redirect from http:// to https:// at your server or " +
          "CDN, and send HSTS so browsers stop trying HTTP entirely.",
      },
    ];
  } catch {
    // Connection refused on port 80 is the ideal outcome: there is nothing
    // listening to downgrade to.
    return [];
  }
}

/**
 * Resources loaded over HTTP on an HTTPS page. Browsers block most of it now,
 * which means the affected feature is silently broken as well as insecure.
 */
export function mixedContentFindings(
  pageUrl: string,
  resourceUrls: string[]
): Finding[] {
  if (!pageUrl.startsWith("https://")) return [];

  const insecure = [...new Set(resourceUrls.filter((u) => u.startsWith("http://")))];
  if (insecure.length === 0) return [];

  return [
    {
      id: "mixed-content",
      category: "security",
      severity: "serious",
      title: `${insecure.length} resource${insecure.length === 1 ? " is" : "s are"} loaded over plain HTTP`,
      detail:
        "Your page is served over HTTPS but pulls these in unencrypted. Browsers " +
        "block active mixed content outright, so whatever depends on these is " +
        "already broken for your users — and the padlock is a lie for the rest.",
      evidence: insecure.slice(0, 6).join("\n"),
      count: insecure.length,
      fix: "Change these URLs to https://, or host the files yourself.",
    },
  ];
}
