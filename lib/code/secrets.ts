import type { Finding } from "../findings";
import type { SourceFile } from "./walk";

/**
 * Secret scanning.
 *
 * Hardcoded credentials are the single most common — and most damaging — thing
 * an AI coding assistant leaves in a codebase. It writes `const apiKey =
 * "sk_live_..."` because that made the example run, and it ships to a public
 * repo.
 *
 * Two rules govern this file:
 *   1. Every match is MASKED before it appears in any output. We show enough to
 *      locate the secret (prefix + last three characters) and never the value.
 *      A security tool that prints your live keys to a screen you are sharing is
 *      worse than no tool.
 *   2. High signal over high recall. Each pattern targets a credential format
 *      specific enough that a match is almost certainly real, so the report is
 *      not drowned in maybes.
 */

interface SecretRule {
  id: string;
  label: string;
  /** Must have a capture group 1 = the secret value to mask. */
  pattern: RegExp;
  severity: Finding["severity"];
  advice: string;
}

const RULES: SecretRule[] = [
  {
    id: "aws-access-key",
    label: "AWS access key",
    pattern: /\b(AKIA[0-9A-Z]{16})\b/,
    severity: "blocker",
    advice:
      "Rotate this key in the AWS console now and delete the hardcoded value. " +
      "Load it from an environment variable instead.",
  },
  {
    id: "stripe-secret-key",
    label: "Stripe live secret key",
    pattern: /\b(sk_live_[0-9a-zA-Z]{20,})\b/,
    severity: "blocker",
    advice:
      "Roll this key in the Stripe dashboard immediately — it can move real " +
      "money. Never keep a live secret key in source; use an env var.",
  },
  {
    id: "openai-key",
    label: "OpenAI API key",
    pattern: /\b(sk-(?:proj-)?[A-Za-z0-9_-]{20,})\b/,
    severity: "blocker",
    advice: "Revoke it in the OpenAI dashboard and load it from an env var.",
  },
  {
    id: "anthropic-key",
    label: "Anthropic API key",
    pattern: /\b(sk-ant-[A-Za-z0-9_-]{20,})\b/,
    severity: "blocker",
    advice: "Revoke it in the Anthropic console and load it from an env var.",
  },
  {
    id: "google-api-key",
    label: "Google API key",
    pattern: /\b(AIza[0-9A-Za-z_-]{35})\b/,
    severity: "serious",
    advice:
      "Restrict or regenerate it in Google Cloud, then load it from an env var.",
  },
  {
    id: "github-token",
    label: "GitHub token",
    pattern: /\b((?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,})\b/,
    severity: "blocker",
    advice: "Revoke it in GitHub settings and load it from an env var.",
  },
  {
    id: "slack-token",
    label: "Slack token",
    pattern: /\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/,
    severity: "serious",
    advice: "Revoke it in the Slack admin console.",
  },
  {
    id: "private-key",
    label: "Private key",
    pattern: /(-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----)/,
    severity: "blocker",
    advice:
      "A private key in source is fully compromised. Generate a new key pair " +
      "and remove this one. Keep private keys in a secrets manager, never in git.",
  },
  {
    id: "db-url-password",
    label: "Database URL with an embedded password",
    pattern: /\b((?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@'"]+:[^\s:@'"]+@[^\s'"]+)/,
    severity: "blocker",
    advice:
      "This connection string contains a live password. Rotate the database " +
      "credential and move the URL into an env var.",
  },
  {
    id: "jwt-secret",
    label: "Hardcoded JWT or session secret",
    pattern: /\b(?:jwt[_-]?secret|session[_-]?secret|token[_-]?secret)\s*[:=]\s*['"]([^'"]{12,})['"]/i,
    severity: "serious",
    advice:
      "Anyone with this secret can forge valid tokens for any user. Move it to " +
      "an env var and rotate it, which invalidates existing sessions.",
  },
  {
    id: "generic-api-key",
    label: "Hardcoded API key or password",
    // Deliberately conservative: an assignment to a key/secret/password name
    // with a long, non-placeholder value.
    pattern: /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token|client[_-]?secret|password|passwd)\s*[:=]\s*['"]([A-Za-z0-9_\-.]{16,})['"]/i,
    severity: "serious",
    advice: "Move it to an environment variable and rotate the value.",
  },
];

/** Values that look like credentials but are obviously placeholders. */
const PLACEHOLDER = /^(?:your|my|the|xxx|test|example|changeme|placeholder|dummy|sample|<|\$\{|process\.env|import\.meta|null|undefined|false|true)/i;

/**
 * Mask a secret so it can be located but not read: keep a short prefix and the
 * last three characters, replace the middle with dots.
 */
export function maskSecret(value: string): string {
  if (value.length <= 8) return value.slice(0, 2) + "••••";
  const prefixLen = value.startsWith("-----") ? 0 : Math.min(6, value.indexOf("_") + 1 || 4);
  const prefix = value.slice(0, prefixLen);
  const suffix = value.slice(-3);
  return `${prefix}${"•".repeat(8)}${suffix}`;
}

export function scanSecrets(files: SourceFile[]): Finding[] {
  // Group hits by rule so ten leaked keys of one kind are one finding with a
  // list, not ten separate cards.
  const byRule = new Map<string, { rule: SecretRule; hits: string[]; locations: string[] }>();

  for (const file of files) {
    for (let i = 0; i < file.lines.length; i++) {
      const line = file.lines[i];
      if (line.length > 1000) continue;

      for (const rule of RULES) {
        const match = rule.pattern.exec(line);
        if (!match) continue;

        const value = match[1] ?? match[0];
        if (PLACEHOLDER.test(value)) continue;

        const entry = byRule.get(rule.id) ?? { rule, hits: [], locations: [] };
        entry.hits.push(maskSecret(value));
        entry.locations.push(`${file.path}:${i + 1}`);
        byRule.set(rule.id, entry);
      }
    }
  }

  const findings: Finding[] = [];

  for (const { rule, hits, locations } of byRule.values()) {
    findings.push({
      id: `secret-${rule.id}`,
      category: "code",
      severity: rule.severity,
      title: `${rule.label} hardcoded in your source`,
      detail:
        "This credential is committed in plain text. Anyone who can read the " +
        "repository — including anyone it is ever shared with, and the whole " +
        "internet if it is public — has it. Assume it is already compromised.",
      evidence: locations
        .slice(0, 6)
        .map((loc, i) => `${loc}  →  ${hits[i]}`)
        .join("\n"),
      location: locations[0],
      count: locations.length,
      fix: rule.advice,
    });
  }

  return findings;
}
