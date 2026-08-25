import type { Metadata } from "next";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import {
  AXE_WCAG_RULE_COUNT,
  CATALOG,
  OWN_CHECK_COUNT,
  TOTAL_CHECK_COUNT,
} from "@/lib/catalog";
import type { Severity } from "@/lib/findings";

export const metadata: Metadata = {
  title: "Every check Axiom runs",
  description:
    "The complete catalog: runtime failures, keyboard operability, mobile layout, links, security headers, launch readiness, secrets, and static analysis of your source.",
};

const SEVERITY_STYLE: Record<Severity, { label: string; className: string }> = {
  blocker: { label: "Blocking", className: "text-blocking" },
  serious: { label: "Serious", className: "text-serious" },
  moderate: { label: "Moderate", className: "text-moderate" },
  minor: { label: "Minor", className: "text-minor" },
};

export default function Checks() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <SiteNav />

      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-6 py-14">
        <p className="tag text-ink-faint">Catalog</p>
        <h1 className="display mt-3 text-4xl leading-[1.1] text-ink sm:text-5xl">
          {TOTAL_CHECK_COUNT} checks,
          <br />
          every audit.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">
          {OWN_CHECK_COUNT} checks written for Axiom, plus the{" "}
          {AXE_WCAG_RULE_COUNT} axe-core rules tagged WCAG 2.1 A/AA that run on
          every page. This list is generated from the engine&apos;s own finding
          ids and asserted against the source in CI, so it cannot drift into
          marketing.
        </p>

        <div className="mt-4 inline-block rounded-lg border border-rule bg-card px-4 py-2.5">
          <code className="font-mono text-sm text-ink-soft">
            npm run verify:catalog
          </code>
        </div>

        <div className="mt-14 flex flex-col gap-12">
          {CATALOG.map((group) => (
            <section key={group.key} aria-labelledby={`g-${group.key}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2
                  id={`g-${group.key}`}
                  className="display text-xl text-ink sm:text-2xl"
                >
                  {group.title}
                </h2>
                <span className="tag text-ink-faint tabular-nums">
                  {group.entries.length} checks
                </span>
              </div>
              <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
                {group.method}
              </p>

              <div className="mt-5 overflow-x-auto rounded-lg border border-rule">
                <table className="w-full border-collapse bg-card text-left">
                  <caption className="sr-only">
                    {group.title}: check name, what it detects, and severity
                  </caption>
                  <thead>
                    <tr className="border-b border-rule">
                      <th scope="col" className="tag px-4 py-2.5 font-normal text-ink-faint">
                        Check
                      </th>
                      <th scope="col" className="tag px-4 py-2.5 font-normal text-ink-faint">
                        What it detects
                      </th>
                      <th scope="col" className="tag px-4 py-2.5 font-normal text-ink-faint">
                        Severity
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.entries.map((entry) => {
                      const tone = SEVERITY_STYLE[entry.severity];
                      return (
                        <tr key={entry.id} className="border-b border-rule last:border-0">
                          <th
                            scope="row"
                            className="px-4 py-3 align-top text-[15px] font-semibold text-ink"
                          >
                            {entry.label}
                          </th>
                          <td className="px-4 py-3 align-top text-[15px] leading-relaxed text-ink-soft">
                            {entry.detects}
                          </td>
                          <td className={`tag whitespace-nowrap px-4 py-3 align-top ${tone.className}`}>
                            {tone.label}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>

        <section
          aria-labelledby="axe"
          className="mt-14 rounded-lg border border-rule bg-card p-6"
        >
          <h2 id="axe" className="display text-lg text-ink">
            Plus the axe-core WCAG ruleset
          </h2>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
            On top of the checks above, every page is run through axe-core&apos;s{" "}
            {AXE_WCAG_RULE_COUNT} rules tagged WCAG 2.1 A/AA — colour contrast,
            form labels, image alternatives, ARIA validity, heading structure and
            the rest. Axiom rewrites the ones it recognises into plain language
            and computes the exact fix where the maths allows.
          </p>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
