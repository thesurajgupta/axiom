"use client";

import { useState } from "react";
import { CATEGORY_LABEL, type Finding, type Severity } from "@/lib/findings";
import type { ScanResult } from "@/lib/scan";

const SEVERITY_ORDER: Severity[] = ["blocker", "serious", "moderate", "minor"];

/**
 * Severity is the organising idea of the whole report, so its vocabulary is
 * defined once and everything else reads from here. The labels are written for
 * consequence, not for taxonomy: "blocking" tells you what it does to your
 * launch, "serious" does not need explaining.
 */
const SEVERITY: Record<
  Severity,
  { label: string; rail: string; text: string; wash: string; meaning: string }
> = {
  blocker: {
    label: "Blocking",
    rail: "bg-blocking",
    text: "text-blocking",
    wash: "bg-blocking-wash",
    meaning: "Someone can't use this, or you're exposed right now.",
  },
  serious: {
    label: "Serious",
    rail: "bg-serious",
    text: "text-serious",
    wash: "bg-serious-wash",
    meaning: "Real risk or real breakage. Most teams would hold the release.",
  },
  moderate: {
    label: "Moderate",
    rail: "bg-moderate",
    text: "text-moderate",
    wash: "bg-moderate-wash",
    meaning: "Worth fixing before launch, not an emergency.",
  },
  minor: {
    label: "Minor",
    rail: "bg-minor",
    text: "text-minor",
    wash: "bg-minor-wash",
    meaning: "Polish.",
  },
};

function CopyButton({
  value,
  label,
  prominent = false,
}: {
  value: string;
  label: string;
  prominent?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
      className={
        prominent
          ? "shrink-0 rounded-md bg-action px-5 py-2.5 text-sm font-semibold text-action-ink"
          : "shrink-0 rounded border border-rule px-2.5 py-1 font-mono text-[11px] text-ink-soft hover:border-rule-strong hover:text-ink"
      }
    >
      {copied ? "Copied" : label}
      {/* Announced to screen readers without moving focus or changing layout. */}
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </button>
  );
}

/**
 * The severity meter: a proportional stacked bar of the four counts.
 *
 * This is the thesis of the page. Before reading a single finding you should be
 * able to tell, from across the room, whether this site is in trouble — and
 * proportion communicates that far faster than four numbers do.
 */
function SeverityMeter({ counts }: { counts: Record<Severity, number> }) {
  const total = SEVERITY_ORDER.reduce((sum, s) => sum + counts[s], 0);
  if (total === 0) return null;

  return (
    <div className="mt-6">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-rule">
        {SEVERITY_ORDER.map((severity) =>
          counts[severity] > 0 ? (
            <div
              key={severity}
              className={SEVERITY[severity].rail}
              style={{ width: `${(counts[severity] / total) * 100}%` }}
            />
          ) : null
        )}
      </div>

      <dl className="mt-4 flex flex-wrap gap-x-7 gap-y-2">
        {SEVERITY_ORDER.map((severity) =>
          counts[severity] > 0 ? (
            <div key={severity} className="flex items-baseline gap-2">
              <dt className={`tag ${SEVERITY[severity].text}`}>
                {SEVERITY[severity].label}
              </dt>
              <dd className="font-mono text-sm font-medium tabular-nums text-ink">
                {counts[severity]}
              </dd>
            </div>
          ) : null
        )}
      </dl>
    </div>
  );
}

function FindingCard({ finding, index }: { finding: Finding; index: number }) {
  const tone = SEVERITY[finding.severity];

  return (
    <article className="border-t border-rule bg-card">
      <div className="px-5 py-5 sm:px-7">
        <div className="flex items-baseline gap-3">
          <span className="tag text-ink-faint tabular-nums">
            {String(index).padStart(2, "0")}
          </span>
          <h3 className="display flex-1 text-lg leading-snug text-ink sm:text-xl">
            {finding.title}
          </h3>
          {finding.count && finding.count > 1 && (
            <span className="shrink-0 font-mono text-xs text-ink-faint tabular-nums">
              {finding.count}×
            </span>
          )}
        </div>

        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
          {finding.detail}
        </p>

        {finding.evidence && (
          <div className="mt-4">
            <p className="tag mb-1.5 text-ink-faint">What we saw</p>
            <pre className="overflow-x-auto rounded border border-rule bg-paper px-3 py-2.5 font-mono text-xs leading-relaxed text-ink-soft">
              <code>{finding.evidence}</code>
            </pre>
          </div>
        )}

        {(finding.location || (finding.pages && finding.pages.length > 0)) && (
          <div className="mt-4">
            <p className="tag mb-1.5 text-ink-faint">Where</p>
            {finding.pages && finding.pages.length > 0 && (
              <ul className="mb-1.5 flex flex-wrap gap-x-3 gap-y-1">
                {finding.pages.slice(0, 6).map((page) => (
                  <li key={page} className="font-mono text-xs text-ink-soft">
                    {pathOf(page)}
                  </li>
                ))}
                {finding.pages.length > 6 && (
                  <li className="font-mono text-xs text-ink-faint">
                    +{finding.pages.length - 6} more
                  </li>
                )}
              </ul>
            )}
            {finding.location && (
              <p className="break-all font-mono text-xs text-ink-faint">
                {finding.location}
              </p>
            )}
          </div>
        )}

        <div className="mt-4">
          <p className="tag mb-1.5 text-ink-faint">Fix</p>
          <p className="max-w-2xl text-[15px] leading-relaxed text-ink">
            {finding.fix}
          </p>
        </div>

        {finding.snippet && (
          <div className="mt-3">
            <div className="flex items-center justify-between gap-3 rounded-t border border-b-0 border-rule bg-paper px-3 py-1.5">
              <span className="tag text-ink-faint">{finding.snippet.language}</span>
              <CopyButton value={finding.snippet.code} label="Copy" />
            </div>
            <pre className="overflow-x-auto rounded-b border border-rule bg-paper px-3 py-2.5 font-mono text-xs leading-relaxed text-ink">
              <code>{finding.snippet.code}</code>
            </pre>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className={`tag ${tone.text}`}>{tone.label}</span>
          <span className="tag text-ink-faint">
            {CATEGORY_LABEL[finding.category]}
          </span>
          {finding.docsUrl && (
            <a
              href={finding.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-action underline underline-offset-2"
            >
              Reference
              <span className="sr-only"> for {finding.title} (opens in a new tab)</span>
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function SeveritySection({
  severity,
  findings,
  startIndex,
}: {
  severity: Severity;
  findings: Finding[];
  startIndex: number;
}) {
  if (findings.length === 0) return null;
  const tone = SEVERITY[severity];

  return (
    <section aria-labelledby={`section-${severity}`} className="flex">
      {/* The severity spine: a single rail running the height of the group, so
          the shape of the report is legible while scrolling past it. */}
      <div className={`w-1 shrink-0 rounded-full ${tone.rail}`} aria-hidden="true" />

      <div className="min-w-0 flex-1 pl-4 sm:pl-6">
        <div className="pb-3">
          <h2 id={`section-${severity}`} className={`tag ${tone.text}`}>
            {tone.label} · {findings.length}
          </h2>
          <p className="mt-1 text-sm text-ink-faint">{tone.meaning}</p>
        </div>

        <div className="overflow-hidden rounded-lg border border-rule border-t-0">
          {findings.map((finding, i) => (
            <FindingCard
              key={finding.id + i}
              finding={finding}
              index={startIndex + i}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export interface ReportView {
  /** Bold verdict line, e.g. "30 things to fix on nimbus.app". */
  subject: string;
  /** Small facts line under the meter. */
  metaLine: string;
  /** Copy shown when there are zero findings. */
  cleanMessage: string;
  findings: Finding[];
  counts: Record<Severity, number>;
  agentPrompt: string;
  cssFixes?: string | null;
}

/** Adapts a live-site ScanResult into the shared report view. */
export function Report({ result }: { result: ScanResult }) {
  return (
    <FindingsReport
      view={{
        subject: hostOf(result.finalUrl),
        metaLine:
          `${result.pagesAudited.length} page${result.pagesAudited.length === 1 ? "" : "s"} ` +
          `opened in a real browser · ${result.tabStops} keyboard stops walked` +
          (result.linksChecked > 0 ? ` · ${result.linksChecked} links checked` : "") +
          ` · ${formatDuration(result.durationMs)}`,
        cleanMessage:
          `We opened ${result.pagesAudited.length} page${result.pagesAudited.length === 1 ? "" : "s"}, ` +
          `walked ${result.tabStops} keyboard stops` +
          (result.linksChecked > 0 ? `, checked ${result.linksChecked} links` : "") +
          ", read the headers and cookies, and rendered everything on a phone. " +
          "No issues worth reporting. That is genuinely rare.",
        findings: result.findings,
        counts: result.counts,
        agentPrompt: result.agentPrompt,
        cssFixes: result.cssFixes,
      }}
    />
  );
}

export function FindingsReport({ view }: { view: ReportView }) {
  const total = view.findings.length;

  if (total === 0) {
    return (
      <section className="mt-10 rounded-lg border border-clear bg-clear-wash p-7">
        <h2 className="display text-2xl text-clear">Nothing to fix</h2>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
          {view.cleanMessage}
        </p>
      </section>
    );
  }

  // Precompute each group's starting number instead of mutating a counter
  // during render — the numbering is derived state, not a side effect.
  const groups = SEVERITY_ORDER.reduce<
    Array<{ severity: Severity; findings: Finding[]; startIndex: number }>
  >((acc, severity) => {
    const findings = view.findings.filter((f) => f.severity === severity);
    const previous = acc[acc.length - 1];
    const startIndex = previous
      ? previous.startIndex + previous.findings.length
      : 1;
    acc.push({ severity, findings, startIndex });
    return acc;
  }, []);

  return (
    <div className="mt-10">
      <section aria-labelledby="verdict" className="rounded-lg border border-rule bg-card p-6 sm:p-8">
        <p className="tag text-ink-faint">Report</p>
        <h2 id="verdict" className="display mt-2 text-2xl leading-tight text-ink sm:text-3xl">
          {total} thing{total === 1 ? "" : "s"} to fix on{" "}
          <span className="break-all font-mono text-lg font-normal text-ink-soft sm:text-xl">
            {view.subject}
          </span>
        </h2>

        <SeverityMeter counts={view.counts} />

        <p className="mt-5 text-sm text-ink-faint">{view.metaLine}</p>
      </section>

      {/* The hero action. Reading a report is work; handing it to an agent is
          the thing most people actually want to do next. */}
      <section
        aria-labelledby="handoff"
        className="mt-4 rounded-lg border border-action bg-card p-6 sm:p-8"
      >
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0 flex-1">
            <h2 id="handoff" className="display text-xl text-ink">
              Fix all {total} with Claude Code
            </h2>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-soft">
              Copy this into Claude Code, Cursor, or any coding agent. It lists
              every finding in severity order with the evidence and what to
              change — so the agent works from what we observed, not guesses.
            </p>
          </div>
          <CopyButton value={view.agentPrompt} label="Copy prompt" prominent />
        </div>

        <details className="group mt-5">
          <summary className="cursor-pointer text-sm text-action underline underline-offset-2">
            Preview the prompt
          </summary>
          <pre className="mt-3 max-h-80 overflow-auto rounded border border-rule bg-paper px-3 py-3 font-mono text-xs leading-relaxed text-ink-soft">
            <code>{view.agentPrompt}</code>
          </pre>
        </details>
      </section>

      {view.cssFixes && (
        <section
          aria-labelledby="css-fixes"
          className="mt-4 rounded-lg border border-rule bg-card p-6 sm:p-8"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 id="css-fixes" className="display text-lg text-ink">
              Or paste this CSS for the style fixes
            </h2>
            <CopyButton value={view.cssFixes} label="Copy CSS" />
          </div>
          <pre className="mt-4 overflow-x-auto rounded border border-rule bg-paper px-3 py-2.5 font-mono text-xs leading-relaxed text-ink">
            <code>{view.cssFixes}</code>
          </pre>
        </section>
      )}

      <div className="mt-10 space-y-10">
        {groups.map((group) => (
          <SeveritySection
            key={group.severity}
            severity={group.severity}
            findings={group.findings}
            startIndex={group.startIndex}
          />
        ))}
      </div>
    </div>
  );
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
