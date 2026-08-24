/**
 * The unified finding model.
 *
 * Every check in the audit — a crashed script, a missing security header, an
 * unreachable button — reduces to the same shape, because the person reading
 * the report does not care which subsystem found the problem. They care about
 * three things, in this order:
 *
 *   1. How bad is it?
 *   2. Where is it?
 *   3. What do I type to fix it?
 *
 * Anything a finding cannot answer for those three questions is not worth
 * reporting.
 */

export type Category =
  | "bug"
  | "security"
  | "accessibility"
  | "seo"
  | "performance"
  | "code";

/**
 * Severity is defined by consequence, not by how hard it was to detect.
 *
 *  blocker  — someone cannot use the product, or you are actively exposed
 *  serious  — real risk or real breakage, ship-blocking for most teams
 *  moderate — should fix before launch, not an emergency
 *  minor    — polish
 */
export type Severity = "blocker" | "serious" | "moderate" | "minor";

export const SEVERITY_ORDER: Record<Severity, number> = {
  blocker: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

export interface Finding {
  id: string;
  category: Category;
  severity: Severity;

  /** Plain English, no jargon. "Your sign-up button can't be reached." */
  title: string;

  /** Why it matters — the consequence, in one or two sentences. */
  detail: string;

  /**
   * The actual observed proof: the error text, the header that was absent, the
   * status code. This is what stops a finding from being a guess.
   */
  evidence?: string;

  /** Where to look: a URL, a selector, a file. */
  location?: string;

  /** Concretely what to change. Copy-pasteable wherever possible. */
  fix: string;

  /** Ready-to-paste code, when the fix is literal. */
  snippet?: { language: string; code: string };

  /** How many places this occurs, summed across every page it was seen on. */
  count?: number;

  /** Pages this finding was observed on. Absent for site-wide findings. */
  pages?: string[];

  /**
   * True only when we applied the fix and re-ran the check to confirm it
   * worked. Most checks cannot do this; the ones that can, do.
   */
  verified?: boolean;

  docsUrl?: string;
}

/**
 * Merge the same finding seen on many pages into one entry.
 *
 * A site-wide audit will report "text is too faint" on every page that shares a
 * stylesheet. Listing it forty times is not forty problems — it is one problem
 * with forty symptoms, and the reader needs the cause plus the list of places,
 * not a wall of duplicates.
 */
export function mergeFindings(findings: Finding[]): Finding[] {
  const byId = new Map<string, Finding>();

  for (const finding of findings) {
    const existing = byId.get(finding.id);

    if (!existing) {
      byId.set(finding.id, { ...finding, pages: finding.pages ?? [] });
      continue;
    }

    existing.count = (existing.count ?? 1) + (finding.count ?? 1);
    existing.pages = [
      ...new Set([...(existing.pages ?? []), ...(finding.pages ?? [])]),
    ];

    // Keep the worst severity seen; the same rule can be blocking on one page
    // and merely serious on another.
    if (SEVERITY_ORDER[finding.severity] < SEVERITY_ORDER[existing.severity]) {
      existing.severity = finding.severity;
    }

    // Keep the first concrete evidence rather than concatenating everything.
    if (!existing.evidence && finding.evidence) {
      existing.evidence = finding.evidence;
    }
    if (!existing.snippet && finding.snippet) {
      existing.snippet = finding.snippet;
    }
  }

  return [...byId.values()];
}

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return a.category.localeCompare(b.category);
  });
}

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = {
    blocker: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
  };
  for (const f of findings) counts[f.severity]++;
  return counts;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  bug: "Broken",
  security: "Security",
  accessibility: "Accessibility",
  seo: "Launch readiness",
  performance: "Performance",
  code: "Code & secrets",
};
