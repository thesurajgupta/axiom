/** Shared vocabulary for the audit pipeline. */

export type PatchOp =
  | { kind: "setAttribute"; name: string; value: string }
  | { kind: "removeAttribute"; name: string }
  | { kind: "setStyle"; property: string; value: string }
  | { kind: "setText"; value: string };

export interface Patch {
  /** axe-core rule this patch is intended to resolve, e.g. "color-contrast". */
  ruleId: string;
  /** CSS selector identifying the offending node, as reported by axe. */
  target: string;
  ops: PatchOp[];
  /** Human-readable justification shown next to the diff. */
  rationale: string;
  /**
   * True when the fix was computed (maths / spec rules), false when a language
   * model supplied semantic content. Surfaced in the UI so reviewers know which
   * patches need a human read.
   */
  deterministic: boolean;
  /** Source-level before/after, for the diff view. */
  before: string;
  after: string;
}

export type VerificationStatus =
  | "verified"       // target violation gone, nothing new broken
  | "ineffective"    // patch applied but violation persists
  | "regressed"      // patch resolved the target but introduced a new violation
  | "errored";       // patch could not be applied

export interface VerifiedPatch extends Patch {
  status: VerificationStatus;
  /**
   * Every element this single fix resolves. Contrast failures in particular are
   * almost always one CSS rule reproduced across hundreds of nodes, so we report
   * root causes rather than symptoms.
   */
  targets: string[];
  coverage: number;
  /** Populated when status === "regressed". */
  introduced?: string[];
  /** Contrast ratio before/after, when applicable. */
  measurement?: { label: string; before: string; after: string };
}

export interface ViolationNode {
  target: string;
  html: string;
  failureSummary: string;
  /** axe check data — carries computed colours for contrast rules. */
  data?: Record<string, unknown>;
}

export interface Violation {
  id: string;
  impact: "minor" | "moderate" | "serious" | "critical" | null;
  description: string;
  help: string;
  helpUrl: string;
  nodes: ViolationNode[];
}

export interface AuditResult {
  url: string;
  scannedAt: string;
  violationsBefore: Violation[];
  patches: VerifiedPatch[];
  violationsAfter: Violation[];
  stats: {
    totalIssues: number;
    nodesAffected: number;
    verified: number;
    rejected: number;
    resolvedIssues: number;
    /** Elements covered by verified fixes — the symptom count behind the causes. */
    elementsFixed: number;
  };
}

/** Progress events streamed to the client during a run. */
export type ScanEvent =
  | { type: "status"; message: string }
  | { type: "scanned"; violations: Violation[] }
  | { type: "patch"; patch: VerifiedPatch }
  | { type: "done"; result: AuditResult }
  | { type: "error"; message: string };
