import type { Category, Severity } from "./findings";

/**
 * The check catalog.
 *
 * Every entry here corresponds to a finding id that the engine can actually
 * emit — the ids are the same strings the scanners produce, so a check that is
 * listed but not implemented (or renamed and forgotten) shows up as a mismatch
 * rather than quietly becoming marketing copy. `scripts/verify-catalog.ts`
 * asserts that correspondence.
 */

export interface CatalogEntry {
  /** The finding id emitted by the engine. */
  id: string;
  label: string;
  /** What the check actually looks at. One line, concrete. */
  detects: string;
  severity: Severity;
}

export interface CatalogGroup {
  key: string;
  title: string;
  category: Category;
  /** How this group observes — the mechanism, not the marketing. */
  method: string;
  entries: CatalogEntry[];
}

export const CATALOG: CatalogGroup[] = [
  {
    key: "runtime",
    title: "What broke while it ran",
    category: "bug",
    method:
      "Console and network listeners attached before navigation, so the earliest failures are captured.",
    entries: [
      {
        id: "runtime-exception",
        label: "Uncaught JavaScript exception",
        detects: "Something threw during load and nothing handled it",
        severity: "blocker",
      },
      {
        id: "api-failure",
        label: "Your API returning 5xx",
        detects: "An endpoint the page depends on failed server-side",
        severity: "blocker",
      },
      {
        id: "broken-resource",
        label: "Files that 404",
        detects: "Images, scripts or stylesheets that never loaded",
        severity: "moderate",
      },
      {
        id: "console-error",
        label: "Console errors",
        detects: "Errors your own code logged that nobody is reading",
        severity: "moderate",
      },
    ],
  },
  {
    key: "keyboard",
    title: "Whether a keyboard works",
    category: "accessibility",
    method:
      "Real Tab keypresses through the page, recording every focus stop — not a DOM read.",
    entries: [
      {
        id: "kbd-unreachable",
        label: "Controls nobody can reach",
        detects: "Interactive elements that never receive focus",
        severity: "blocker",
      },
      {
        id: "kbd-focus-invisible",
        label: "Invisible focus",
        detects: "Focusing the element changes nothing on screen",
        severity: "blocker",
      },
      {
        id: "kbd-trap",
        label: "Keyboard traps",
        detects: "Focus enters a region and cannot Tab back out",
        severity: "blocker",
      },
      {
        id: "kbd-order",
        label: "Illogical tab order",
        detects: "Focus jumps far back up the page mid-sequence",
        severity: "moderate",
      },
    ],
  },
  {
    key: "responsive",
    title: "How it behaves on a phone",
    category: "accessibility",
    method: "The page re-rendered at 390×844 and measured.",
    entries: [
      {
        id: "mobile-overflow",
        label: "Sideways scrolling",
        detects: "Content extends past the right edge of the viewport",
        severity: "serious",
      },
      {
        id: "small-tap-targets",
        label: "Tap targets under 24px",
        detects: "Controls too small to hit reliably (WCAG 2.2)",
        severity: "moderate",
      },
      {
        id: "tiny-text",
        label: "Text under 12px",
        detects: "Body copy too small to read on a handset",
        severity: "moderate",
      },
    ],
  },
  {
    key: "links",
    title: "Every link on the site",
    category: "bug",
    method:
      "Each unique URL requested once — HEAD first, falling back to GET — across every page found.",
    entries: [
      {
        id: "broken-internal-link",
        label: "Internal links to nowhere",
        detects: "Links to your own pages that return 404 or 5xx",
        severity: "serious",
      },
      {
        id: "broken-external-link",
        label: "Dead outbound links",
        detects: "Links to other sites that no longer resolve",
        severity: "moderate",
      },
    ],
  },
  {
    key: "security-headers",
    title: "What the server gives away",
    category: "security",
    method:
      "Response headers, cookie flags and well-known paths — read, never attacked.",
    entries: [
      {
        id: "header-content-security-policy",
        label: "No Content Security Policy",
        detects: "Missing the main defence against cross-site scripting",
        severity: "serious",
      },
      {
        id: "header-strict-transport-security",
        label: "HSTS not enabled",
        detects: "First request can be downgraded to plain HTTP",
        severity: "serious",
      },
      {
        id: "header-x-frame-options",
        label: "Site can be framed",
        detects: "Clickjacking is possible on sensitive actions",
        severity: "serious",
      },
      {
        id: "header-x-content-type-options",
        label: "MIME sniffing allowed",
        detects: "Browsers may execute a file you served as text",
        severity: "moderate",
      },
      {
        id: "header-referrer-policy",
        label: "Full URLs leak",
        detects: "Your paths and query strings sent to third parties",
        severity: "minor",
      },
      {
        id: "header-disclosure",
        label: "Stack disclosed",
        detects: "Server headers naming your software and version",
        severity: "minor",
      },
      {
        id: "no-https-redirect",
        label: "HTTP doesn't redirect",
        detects: "Plain HTTP serves content instead of upgrading",
        severity: "serious",
      },
      {
        id: "mixed-content",
        label: "Mixed content",
        detects: "HTTPS page pulling resources over plain HTTP",
        severity: "serious",
      },
      {
        id: "cookie-insecure",
        label: "Cookies without Secure",
        detects: "Session cookies transmittable in the clear",
        severity: "serious",
      },
      {
        id: "cookie-not-httponly",
        label: "Cookies readable by JS",
        detects: "Any script on the page can steal the session",
        severity: "serious",
      },
      {
        id: "cookie-samesite",
        label: "Cookies without SameSite",
        detects: "Exposed to cross-site request forgery",
        severity: "moderate",
      },
      {
        id: "exposed-file",
        label: "Exposed .env / .git",
        detects: "Secrets publicly downloadable right now",
        severity: "blocker",
      },
      {
        id: "exposed-sourcemap",
        label: "Public source maps",
        detects: "Your original source reconstructable by anyone",
        severity: "moderate",
      },
    ],
  },
  {
    key: "launch",
    title: "What you forgot before launch",
    category: "seo",
    method: "The rendered document head, plus robots.txt and sitemap.xml.",
    entries: [
      {
        id: "noindex",
        label: "Still set to noindex",
        detects: "A staging directive that shipped to production",
        severity: "blocker",
      },
      {
        id: "robots-blocks-all",
        label: "robots.txt blocks everything",
        detects: "Disallow: / hiding the whole site from search",
        severity: "blocker",
      },
      {
        id: "missing-viewport",
        label: "No viewport tag",
        detects: "Phones render at desktop width and zoom out",
        severity: "serious",
      },
      {
        id: "missing-title",
        label: "No page title",
        detects: "Blank tab, blank search result, blank bookmark",
        severity: "serious",
      },
      {
        id: "missing-og",
        label: "No share preview",
        detects: "Links render as a grey box when shared",
        severity: "moderate",
      },
      {
        id: "missing-description",
        label: "No meta description",
        detects: "Google invents your search snippet",
        severity: "moderate",
      },
      {
        id: "missing-h1",
        label: "No main heading",
        detects: "Screen readers and crawlers can't find the topic",
        severity: "moderate",
      },
      {
        id: "multiple-h1",
        label: "Multiple h1 elements",
        detects: "An ambiguous document outline",
        severity: "minor",
      },
      {
        id: "missing-favicon",
        label: "No favicon",
        detects: "A blank icon in the browser tab",
        severity: "minor",
      },
      {
        id: "missing-robots",
        label: "No robots.txt",
        detects: "Nothing telling crawlers what to skip",
        severity: "minor",
      },
      {
        id: "missing-sitemap",
        label: "No sitemap.xml",
        detects: "Discovery relies entirely on internal links",
        severity: "minor",
      },
    ],
  },
  {
    key: "performance",
    title: "How slow it is",
    category: "performance",
    method: "The browser's own navigation and resource timing.",
    entries: [
      {
        id: "slow-first-paint",
        label: "Slow first paint",
        detects: "Users stare at a blank screen past 3 seconds",
        severity: "moderate",
      },
      {
        id: "heavy-page",
        label: "Heavy page weight",
        detects: "Megabytes shipped for the first screen",
        severity: "moderate",
      },
      {
        id: "no-compression",
        label: "No compression",
        detects: "Text served without gzip or brotli",
        severity: "moderate",
      },
    ],
  },
  {
    key: "secrets",
    title: "Secrets in your source",
    category: "code",
    method:
      "Format-specific patterns over your files. Every match is masked before it is ever displayed.",
    entries: [
      {
        id: "secret-aws-access-key",
        label: "AWS access key",
        detects: "AKIA-prefixed credentials in code",
        severity: "blocker",
      },
      {
        id: "secret-stripe-secret-key",
        label: "Stripe live key",
        detects: "sk_live_ keys that can move real money",
        severity: "blocker",
      },
      {
        id: "secret-openai-key",
        label: "OpenAI key",
        detects: "sk- / sk-proj- API credentials",
        severity: "blocker",
      },
      {
        id: "secret-anthropic-key",
        label: "Anthropic key",
        detects: "sk-ant- API credentials",
        severity: "blocker",
      },
      {
        id: "secret-github-token",
        label: "GitHub token",
        detects: "ghp_ / github_pat_ tokens",
        severity: "blocker",
      },
      {
        id: "secret-private-key",
        label: "Private key",
        detects: "PEM-encoded RSA, EC or OpenSSH keys",
        severity: "blocker",
      },
      {
        id: "secret-db-url-password",
        label: "DB URL with password",
        detects: "postgres:// and friends with inline credentials",
        severity: "blocker",
      },
      {
        id: "secret-google-api-key",
        label: "Google API key",
        detects: "AIza-prefixed keys",
        severity: "serious",
      },
      {
        id: "secret-slack-token",
        label: "Slack token",
        detects: "xoxb / xoxp workspace tokens",
        severity: "serious",
      },
      {
        id: "secret-jwt-secret",
        label: "Hardcoded JWT secret",
        detects: "A signing secret anyone can forge tokens with",
        severity: "serious",
      },
      {
        id: "secret-generic-api-key",
        label: "Generic API key or password",
        detects: "Long literal assigned to a key/password name",
        severity: "serious",
      },
    ],
  },
  {
    key: "sast",
    title: "Injection, auth and payment bugs",
    category: "code",
    method:
      "Pattern analysis over your source. Reports the dangerous shape it detected, never a claim of proven exploitability.",
    entries: [
      {
        id: "pattern-sql-injection",
        label: "SQL injection",
        detects: "Queries assembled by string concatenation",
        severity: "blocker",
      },
      {
        id: "pattern-command-injection",
        label: "Command injection",
        detects: "Shell commands built from a variable",
        severity: "blocker",
      },
      {
        id: "pattern-jwt-none-verify",
        label: "Unverified JWT",
        detects: "jwt.decode without checking the signature",
        severity: "blocker",
      },
      {
        id: "pattern-client-trusted-amount",
        label: "Client-set payment amount",
        detects: "Charge amount taken from the request body",
        severity: "blocker",
      },
      {
        id: "pattern-tls-disabled",
        label: "TLS verification off",
        detects: "rejectUnauthorized:false or NODE_TLS_REJECT_UNAUTHORIZED=0",
        severity: "blocker",
      },
      {
        id: "no-rate-limit-auth",
        label: "No rate limit on auth",
        detects: "Login/reset routes with no throttling referenced",
        severity: "serious",
      },
      {
        id: "stripe-webhook-unverified",
        label: "Unverified Stripe webhook",
        detects: "Webhook handled without constructEvent",
        severity: "serious",
      },
      {
        id: "pattern-path-traversal",
        label: "Path traversal",
        detects: "File paths built from request input",
        severity: "serious",
      },
      {
        id: "pattern-weak-hash",
        label: "Weak password hashing",
        detects: "MD5 or SHA-1 used on passwords",
        severity: "serious",
      },
      {
        id: "pattern-dangerous-html",
        label: "XSS via raw HTML",
        detects: "dangerouslySetInnerHTML with a variable",
        severity: "serious",
      },
      {
        id: "pattern-eval-use",
        label: "eval / new Function",
        detects: "A string executed as code",
        severity: "serious",
      },
      {
        id: "pattern-cors-wildcard-credentials",
        label: "Unsafe CORS",
        detects: "Any origin allowed together with credentials",
        severity: "serious",
      },
      {
        id: "pattern-open-redirect",
        label: "Open redirect",
        detects: "Redirect target taken from request input",
        severity: "moderate",
      },
      {
        id: "pattern-error-leak",
        label: "Raw error to client",
        detects: "Stack traces and internals returned to the browser",
        severity: "moderate",
      },
      {
        id: "pattern-debug-enabled",
        label: "Debug mode on",
        detects: "Framework debug flags left enabled",
        severity: "moderate",
      },
    ],
  },
  {
    key: "deps",
    title: "Dependencies and config",
    category: "code",
    method: "Your manifest, lockfile and .gitignore — read entirely offline.",
    entries: [
      {
        id: "env-not-ignored",
        label: ".env not git-ignored",
        detects: "An environment file likely tracked in git",
        severity: "serious",
      },
      {
        id: "dep-non-registry",
        label: "Dependencies from URLs",
        detects: "Packages pulled from git/http, skipping integrity checks",
        severity: "moderate",
      },
      {
        id: "no-lockfile",
        label: "No lockfile",
        detects: "Installs can resolve to versions you never tested",
        severity: "moderate",
      },
      {
        id: "dep-install-script",
        label: "Install scripts",
        detects: "Code that runs automatically on npm install",
        severity: "minor",
      },
    ],
  },
];

/** Checks written for Axiom. The axe-core WCAG ruleset runs on top of these. */
export const OWN_CHECK_COUNT = CATALOG.reduce(
  (n, g) => n + g.entries.length,
  0
);

/**
 * axe-core rules tagged wcag2a / wcag2aa / wcag21a / wcag21aa that run on every
 * page in addition to the checks above. Verified against the installed version
 * by scripts/verify-catalog.ts.
 */
export const AXE_WCAG_RULE_COUNT = 69;

export const TOTAL_CHECK_COUNT = OWN_CHECK_COUNT + AXE_WCAG_RULE_COUNT;
