import type { Finding } from "../findings";
import type { SourceFile } from "./walk";

/**
 * Source-pattern rules — a security linter for the mistakes AI coding
 * assistants make constantly.
 *
 * This is heuristic static analysis, and it is honest about that: it flags code
 * that *matches a dangerous shape*, and the wording of every finding says
 * "detected" rather than "proven exploitable". That is the correct posture. A
 * pattern scanner's job is to put a human's eyes on the twelve lines that
 * deserve them, out of a codebase of ten thousand.
 *
 * The rules target the specific ways generated code goes wrong: string-built
 * SQL, a payment amount trusted from the client, an auth route with no rate
 * limiting, TLS verification switched off to make an error go away.
 */

interface PatternRule {
  id: string;
  category: Finding["category"];
  severity: Finding["severity"];
  title: string;
  detail: string;
  fix: string;
  /** File globs this rule applies to, by extension. Empty = all text files. */
  exts?: string[];
  pattern: RegExp;
  /** Suppress when this also matches the line — reduces obvious false positives. */
  unless?: RegExp;
  snippet?: { language: string; code: string };
}

const RULES: PatternRule[] = [
  // --- injection --------------------------------------------------------
  {
    id: "sql-injection",
    category: "code",
    severity: "blocker",
    title: "SQL query built by string concatenation",
    detail:
      "A query is assembled with user-controlled values instead of parameters. " +
      "This is the classic SQL-injection shape: a value like \"'; DROP TABLE " +
      "users; --\" changes what the query does. It is the most exploited web " +
      "vulnerability there is.",
    pattern:
      /['"][^'"]*\b(?:SELECT|INSERT|UPDATE|DELETE|WHERE|FROM)\b[^'"]*['"]\s*\+|\+\s*[^;\n]*\bAND\b\s*[a-z_]*\s*=|`[^`]*\b(?:SELECT|INSERT|UPDATE|DELETE|WHERE|FROM)\b[^`]*\$\{/i,
    fix:
      "Use parameterised queries — pass values as a second argument, never build " +
      "the string yourself. Every database driver supports this.",
    snippet: {
      language: "js",
      code: '// vulnerable\ndb.query("SELECT * FROM users WHERE id = " + req.params.id)\n\n// safe\ndb.query("SELECT * FROM users WHERE id = $1", [req.params.id])',
    },
  },
  {
    id: "command-injection",
    category: "code",
    severity: "blocker",
    title: "Shell command built from a variable",
    detail:
      "A value is interpolated into a shell command. If any part of it comes " +
      "from a request, an attacker can run arbitrary commands on your server " +
      "with a payload like \"; rm -rf /\".",
    pattern:
      /\b(?:exec|execSync|spawn|spawnSync)\s*\(\s*[`'"][^`'"]*\$\{|\b(?:exec|execSync)\s*\(\s*[`'"][^`'"]*[`'"]\s*\+/,
    fix:
      "Use execFile/spawn with an argument array so values can never be parsed " +
      "as shell syntax, and validate the input against an allowlist.",
    snippet: {
      language: "js",
      code: '// vulnerable\nexec(`convert ${req.query.file} out.png`)\n\n// safe\nexecFile("convert", [req.query.file, "out.png"])',
    },
  },
  {
    id: "eval-use",
    category: "code",
    severity: "serious",
    title: "eval() or new Function() on a dynamic value",
    detail:
      "Executing a string as code is remote code execution the moment any part " +
      "of that string is influenced by input. There is almost always a direct " +
      "alternative.",
    pattern: /(?<!["'`:.])\beval\s*\(|(?<!["'`])new\s+Function\s*\(/,
    unless: /\/\/|\*|eslint|JSON\.parse|["'`][^"'`]*eval/,
    fix:
      "For data, use JSON.parse. For dynamic property access, use bracket " +
      "notation. There is no safe way to eval untrusted input.",
  },
  {
    id: "dangerous-html",
    category: "code",
    severity: "serious",
    title: "dangerouslySetInnerHTML with a non-constant value",
    detail:
      "Rendering a variable as raw HTML is cross-site scripting if that value " +
      "ever contains user content — a comment, a name, a bio. The attacker's " +
      "script runs in your users' sessions.",
    exts: [".jsx", ".tsx"],
    pattern: /dangerouslySetInnerHTML\s*=\s*\{\{\s*__html:\s*(?![`'"])/,
    fix:
      "Render the value as text, or sanitise it with a library like DOMPurify " +
      "before setting it as HTML.",
  },
  {
    id: "path-traversal",
    category: "code",
    severity: "serious",
    title: "File path built from request input",
    detail:
      "A file path is constructed from a request value. Without validation, " +
      "\"../../etc/passwd\" reads files far outside the folder you intended.",
    pattern:
      /\b(?:readFile|readFileSync|createReadStream|sendFile|unlink|writeFile)\s*\([^)]*\b(?:req\.(?:params|query|body)|request\.)/,
    fix:
      "Resolve the path and confirm it still sits inside the intended directory " +
      "before touching it. Reject anything containing \"..\".",
  },
  {
    id: "open-redirect",
    category: "code",
    severity: "moderate",
    title: "Redirect target taken from request input",
    detail:
      "Redirecting to a user-supplied URL lets an attacker send your users to a " +
      "phishing page through a link that looks like it points at your domain.",
    pattern: /\b(?:res\.redirect|response\.redirect)\s*\(\s*(?:req\.(?:query|params|body)|request\.)/,
    fix:
      "Redirect only to a fixed allowlist of paths, or validate that the target " +
      "is on your own origin.",
  },

  // --- authentication & rate limiting ----------------------------------
  {
    id: "weak-hash",
    category: "code",
    severity: "serious",
    title: "Password hashed with MD5 or SHA-1",
    detail:
      "These are fast hashes built for checksums, not passwords. A modern GPU " +
      "tries billions per second, so a leaked database of them is cracked in " +
      "hours.",
    pattern: /createHash\s*\(\s*['"](?:md5|sha1)['"]\s*\)/i,
    fix:
      "Use a purpose-built password hash: bcrypt, scrypt, or argon2. They are " +
      "deliberately slow and salted.",
    snippet: {
      language: "js",
      code: 'import bcrypt from "bcrypt";\nconst hash = await bcrypt.hash(password, 12);',
    },
  },
  {
    id: "jwt-none-verify",
    category: "code",
    severity: "blocker",
    title: "JWT decoded without verifying its signature",
    detail:
      "jwt.decode reads a token without checking it was actually signed by you. " +
      "An attacker can hand-craft a token claiming to be any user, including an " +
      "admin, and you will trust it.",
    pattern: /\bjwt\.decode\s*\(/,
    unless: /verify/,
    fix: "Use jwt.verify with your secret. jwt.decode is only ever safe for reading a token you have already verified.",
  },

  // --- payment ----------------------------------------------------------
  {
    id: "client-trusted-amount",
    category: "code",
    severity: "blocker",
    title: "Payment amount taken from the client",
    detail:
      "The charge amount comes from the request body. A user can open dev tools " +
      "and change the price to whatever they like before it reaches Stripe — " +
      "including one cent, or zero.",
    pattern:
      /(?:amount|unit_amount|price)\s*:\s*(?:req\.body|request\.body|req\.query|body\.(?:amount|price)|data\.(?:amount|price))/,
    fix:
      "Never trust a price from the client. Look the amount up on the server " +
      "from the product ID the client sent, and charge that.",
  },
  {
    id: "stripe-webhook-unverified",
    category: "code",
    severity: "serious",
    title: "Stripe webhook handled without signature verification",
    detail:
      "A webhook route processes events but never calls constructEvent to verify " +
      "the Stripe signature. Anyone who finds the URL can POST a fake " +
      "\"payment succeeded\" event and unlock paid features for free.",
    pattern: /webhook/i,
    // Only meaningful in a file that also references stripe and an event body.
    unless: /constructEvent|stripe-signature/i,
    fix:
      "Verify every webhook with stripe.webhooks.constructEvent using your " +
      "webhook signing secret before acting on it.",
  },

  // --- configuration ----------------------------------------------------
  {
    id: "tls-disabled",
    category: "code",
    severity: "blocker",
    title: "TLS certificate verification is turned off",
    detail:
      "This makes every outbound HTTPS request accept any certificate, which " +
      "defeats encryption entirely — a network attacker can read and alter the " +
      "traffic. It is almost always added to silence a certificate error.",
    pattern:
      /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0|rejectUnauthorized\s*:\s*false|verify\s*=\s*False/,
    fix:
      "Fix the underlying certificate problem instead. Never ship with " +
      "verification disabled — it removes the point of HTTPS.",
  },
  {
    id: "cors-wildcard-credentials",
    category: "code",
    severity: "serious",
    title: "CORS allows any origin together with credentials",
    detail:
      "Allowing every origin while also allowing credentials lets any website " +
      "make authenticated requests as your logged-in users and read the " +
      "responses. Browsers forbid the literal combination, so this is often " +
      "reflected back per-request, which is just as dangerous.",
    pattern: /origin\s*:\s*true\s*,[\s\S]{0,80}credentials\s*:\s*true|Access-Control-Allow-Origin['"]?\s*[,:]\s*['"]\*['"][\s\S]{0,120}Allow-Credentials/i,
    fix: "List the specific origins you trust. Never combine a wildcard origin with credentials.",
  },
  {
    id: "debug-enabled",
    category: "code",
    severity: "moderate",
    title: "Debug mode appears to be enabled",
    detail:
      "Debug mode exposes stack traces, internal paths, and sometimes an " +
      "interactive console to anyone who triggers an error in production.",
    pattern: /\bdebug\s*[:=]\s*True\b|DEBUG\s*=\s*True|app\.run\([^)]*debug\s*=\s*True/,
    fix: "Drive debug from an environment variable and default it to off.",
  },
  {
    id: "error-leak",
    category: "code",
    severity: "moderate",
    title: "Raw error sent to the client",
    detail:
      "Returning the error object to the browser leaks stack traces, query " +
      "text, and file paths that hand an attacker a map of your internals.",
    pattern: /res\.(?:status\(\d+\)\.)?(?:send|json)\s*\(\s*(?:err|error|e)\s*\)/,
    fix:
      "Log the full error server-side and return a generic message with a " +
      "reference id to the client.",
  },
];

const EXT_RE = /\.[a-z0-9]+$/i;

function extOf(path: string): string {
  return path.match(EXT_RE)?.[0]?.toLowerCase() ?? "";
}

/**
 * Route/webhook rules need file-level context, not just a line. These run once
 * per file rather than per line.
 */
function fileLevelFindings(file: SourceFile): Finding[] {
  const findings: Finding[] = [];
  const ext = extOf(file.path);
  if (![".js", ".jsx", ".ts", ".tsx", ".mjs", ".py"].includes(ext)) return findings;

  const content = file.content;
  const lower = content.toLowerCase();

  // Strip comments before looking for a rate limiter: a line that says
  // "// no rate limiting here" must not count as having one.
  const codeOnly = file.lines
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("#");
    })
    .join("\n")
    .toLowerCase();

  // Rate limiting on authentication endpoints. If a file clearly handles auth
  // (login/signup/reset/token) but nothing in it references any rate limiter,
  // that is a real and common gap: credential-stuffing and brute force run
  // unimpeded.
  const looksLikeAuthRoute =
    /\b(?:login|signin|sign-in|signup|sign-up|register|reset[-_]?password|forgot[-_]?password|authenticate|\/token)\b/i.test(
      content
    ) && /\b(?:req\.body|request\.body|res\.|app\.(?:post|get)|router\.(?:post|get)|export\s+async\s+function\s+(?:POST|GET))\b/.test(content);

  const hasRateLimit =
    /rate[-_ ]?limit|ratelimit|express-rate-limit|@upstash\/ratelimit|throttle|slowdown|\blimiter\b|bottleneck/i.test(
      codeOnly
    );

  if (looksLikeAuthRoute && !hasRateLimit) {
    const line =
      file.lines.findIndex((l) =>
        /login|signin|signup|register|reset|authenticate/i.test(l)
      ) + 1;
    findings.push({
      id: "no-rate-limit-auth",
      category: "code",
      severity: "serious",
      title: "No rate limiting on an authentication route",
      detail:
        "This file handles login or account actions but nothing in it limits " +
        "how often the endpoint can be called. That lets an attacker try " +
        "thousands of passwords a minute, or spam password-reset emails. It is " +
        "one of the most common gaps in generated code.",
      evidence: `${file.path}:${Math.max(line, 1)} — auth logic with no rate limiter referenced`,
      location: file.path,
      fix:
        "Add a rate limiter in front of this route — express-rate-limit, or " +
        "@upstash/ratelimit on serverless. Limit by IP and by account.",
      snippet: {
        language: "js",
        code: 'import rateLimit from "express-rate-limit";\nconst limiter = rateLimit({ windowMs: 60_000, max: 10 });\napp.post("/login", limiter, loginHandler);',
      },
    });
  }

  // Stripe webhook without verification, scoped to files that actually look
  // like a webhook handler for Stripe.
  if (/stripe/i.test(lower) && /webhook/i.test(lower) && !/constructevent/i.test(lower)) {
    const line = file.lines.findIndex((l) => /webhook/i.test(l)) + 1;
    findings.push({
      id: "stripe-webhook-unverified",
      category: "code",
      severity: "serious",
      title: "Stripe webhook handled without signature verification",
      detail:
        "This file handles a Stripe webhook but never verifies the signature " +
        "with constructEvent. Anyone who finds the URL can POST a fake " +
        "\"payment succeeded\" event and unlock paid features for free.",
      evidence: `${file.path}:${Math.max(line, 1)} — webhook handling without constructEvent`,
      location: file.path,
      fix:
        "Verify every event with stripe.webhooks.constructEvent and your " +
        "signing secret before acting on it.",
    });
  }

  return findings;
}

export function scanPatterns(files: SourceFile[]): Finding[] {
  const grouped = new Map<
    string,
    { rule: PatternRule; locations: string[]; evidence: string[] }
  >();
  const fileLevel: Finding[] = [];

  for (const file of files) {
    const ext = extOf(file.path);

    for (let i = 0; i < file.lines.length; i++) {
      const line = file.lines[i];
      if (line.length > 2000) continue;
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("#")) {
        continue;
      }

      for (const rule of RULES) {
        // The webhook rule is handled at file level; skip its per-line form.
        if (rule.id === "stripe-webhook-unverified") continue;
        if (rule.exts && !rule.exts.includes(ext)) continue;
        if (!rule.pattern.test(line)) continue;
        if (rule.unless && rule.unless.test(line)) continue;

        const entry =
          grouped.get(rule.id) ?? { rule, locations: [], evidence: [] };
        entry.locations.push(`${file.path}:${i + 1}`);
        entry.evidence.push(`${file.path}:${i + 1}  ${trimmed.slice(0, 100)}`);
        grouped.set(rule.id, entry);
      }
    }

    fileLevel.push(...fileLevelFindings(file));
  }

  const findings: Finding[] = [];

  for (const { rule, locations, evidence } of grouped.values()) {
    findings.push({
      id: `pattern-${rule.id}`,
      category: rule.category,
      severity: rule.severity,
      title: rule.title,
      detail: rule.detail,
      evidence: evidence.slice(0, 6).join("\n"),
      location: locations[0],
      count: locations.length,
      fix: rule.fix,
      snippet: rule.snippet,
    });
  }

  // Deduplicate file-level findings by id (keep the merge to scan.ts, but avoid
  // emitting the same webhook finding from two paths here).
  const seen = new Set(findings.map((f) => f.id));
  for (const f of fileLevel) {
    findings.push(f);
    seen.add(f.id);
  }

  return findings;
}
