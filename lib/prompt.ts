import type { Finding } from "./findings";
import { CATEGORY_LABEL, sortFindings } from "./findings";

/**
 * Generate a prompt the developer can paste straight into Claude Code (or any
 * coding agent) to fix everything we found.
 *
 * This is the part that turns an audit into work that actually gets done. A
 * report tells you about twenty problems and leaves you to open twenty files.
 * The whole point of finding problems from the outside is that you then have to
 * go back inside and fix them — so we write that handoff.
 *
 * The prompt is deliberately structured rather than prose: agents follow
 * ordered, specific instructions far more reliably than paragraphs, and a human
 * reading it should be able to see exactly what is about to change and why.
 */
export function buildAgentPrompt(url: string, findings: Finding[]): string {
  if (findings.length === 0) {
    return `I audited ${url} and found no issues to fix.`;
  }

  const sorted = sortFindings(findings);
  const blockers = sorted.filter((f) => f.severity === "blocker");
  const rest = sorted.filter((f) => f.severity !== "blocker");

  const lines: string[] = [];

  lines.push(
    `I ran an external audit on ${url} and found ${findings.length} issue${findings.length === 1 ? "" : "s"} to fix in this codebase.`,
    "",
    "Work through them in the order given — they are sorted by severity. For each one:",
    "",
    "1. Find where it lives in this repo (the audit only saw the rendered page, so the selectors and URLs below are hints, not file paths).",
    "2. Make the smallest change that fixes the underlying cause, not just the symptom.",
    "3. If the same root cause produces several of these, fix it once properly rather than patching each occurrence.",
    "4. Tell me if a fix would require a decision I should make — do not guess at product intent.",
    "",
    "Do not refactor anything unrelated while you are in there.",
    ""
  );

  if (blockers.length > 0) {
    lines.push("---", "", `## Fix these first (${blockers.length} blocker${blockers.length === 1 ? "" : "s"})`, "");
    blockers.forEach((f, i) => lines.push(...renderFinding(f, i + 1)));
  }

  if (rest.length > 0) {
    lines.push("---", "", `## Then these (${rest.length})`, "");
    rest.forEach((f, i) => lines.push(...renderFinding(f, blockers.length + i + 1)));
  }

  lines.push(
    "---",
    "",
    "## When you are done",
    "",
    "Summarise what you changed and which of the above are now resolved. Flag anything you deliberately skipped, and why.",
    ""
  );

  return lines.join("\n");
}

function renderFinding(finding: Finding, index: number): string[] {
  const lines: string[] = [];

  lines.push(
    `### ${index}. ${finding.title}`,
    "",
    `- **Severity:** ${finding.severity}`,
    `- **Area:** ${CATEGORY_LABEL[finding.category]}`
  );

  if (finding.count && finding.count > 1) {
    lines.push(`- **Occurrences:** ${finding.count}`);
  }
  if (finding.location) {
    lines.push(`- **Seen at:** ${truncate(finding.location, 200)}`);
  }

  lines.push("", `**Why it matters:** ${finding.detail}`, "");

  if (finding.evidence) {
    lines.push("**What the audit observed:**", "", "```", truncate(finding.evidence, 600), "```", "");
  }

  lines.push(`**What to do:** ${finding.fix}`, "");

  if (finding.snippet) {
    lines.push(
      "**Reference:**",
      "",
      "```" + finding.snippet.language,
      finding.snippet.code,
      "```",
      ""
    );
  }

  if (finding.docsUrl) {
    lines.push(`Reference: ${finding.docsUrl}`, "");
  }

  return lines;
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) + "…" : value;
}

/**
 * A compact CSS block for the subset of findings that are literally a style
 * change. Some fixes need a developer to think; these ones just need pasting.
 */
export function buildCssFixes(findings: Finding[]): string | null {
  const cssFindings = findings.filter(
    (f) => f.snippet?.language === "css" && f.snippet.code.includes("{")
  );
  if (cssFindings.length === 0) return null;

  const blocks = cssFindings.map((f) => `/* ${f.title} */\n${f.snippet!.code}`);

  return [
    "/* Fixes found by Axiom.",
    "   Paste at the end of your stylesheet so these win the cascade,",
    "   then move them into the right rules when you have a moment. */",
    "",
    ...blocks,
  ].join("\n");
}
