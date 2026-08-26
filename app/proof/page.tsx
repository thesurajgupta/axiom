import type { Metadata } from "next";
import { SiteFooter, SiteNav } from "@/components/site-nav";

export const metadata: Metadata = {
  title: "Axiom's receipts",
  description:
    "Measured results from real runs: a site built to fail, the people who wrote the accessibility spec, a deliberately vulnerable codebase, and Axiom audited by itself.",
};

interface Run {
  target: string;
  note: string;
  stats: string;
  counts: { blocking: number; serious: number; moderate: number; minor: number };
  takeaway: string;
}

/**
 * Every number here came from an actual run of the shipped engine. Anything we
 * could not reproduce on the current code is not listed.
 */
const RUNS: Run[] = [
  {
    target: "The bundled demo site",
    note: "npm run fixture — six pages built to fail in every category",
    stats: "6 pages · 12 links checked · 45 keyboard stops · 34.7s",
    counts: { blocking: 4, serious: 11, moderate: 11, minor: 4 },
    takeaway:
      "Finds the exposed .env with a Stripe key, a 500 from its own API, an uncaught exception, an unreachable sign-up button, five dead internal links, and a pricing table that overflows on mobile.",
  },
  {
    target: "w3.org",
    note: "The people who wrote the accessibility specification",
    stats: "5 pages · 140 links checked · 222 keyboard stops · 52.5s",
    counts: { blocking: 0, serious: 2, moderate: 5, minor: 3 },
    takeaway:
      "Zero blockers, as you would hope. Getting this number right mattered more than getting it high — two false positives showed up on the first run here and both were fixed before shipping.",
  },
  {
    target: "news.ycombinator.com",
    note: "A real, high-traffic production site",
    stats: "3 pages · 325 links checked · 450 keyboard stops · 90.2s",
    counts: { blocking: 2, serious: 4, moderate: 5, minor: 2 },
    takeaway:
      "689 separate faint-text elements across three pages collapsed into a single finding, because they share one cause. Thirteen findings you can act on instead of a list of 689 symptoms.",
  },
  {
    target: "A deliberately vulnerable codebase",
    note: "npm run audit:demo — the code audit, not the browser",
    stats: "6 files scanned · under 1s",
    counts: { blocking: 9, serious: 5, moderate: 4, minor: 1 },
    takeaway:
      "Hardcoded Stripe and AWS keys, SQL built by concatenation, jwt.decode without verification, a payment amount trusted from the client, a login route with no rate limiting. Every secret masked in the output.",
  },
];

function Bar({ counts }: { counts: Run["counts"] }) {
  const total =
    counts.blocking + counts.serious + counts.moderate + counts.minor;
  if (total === 0) return null;

  const segments = [
    { n: counts.blocking, className: "bg-blocking" },
    { n: counts.serious, className: "bg-serious" },
    { n: counts.moderate, className: "bg-moderate" },
    { n: counts.minor, className: "bg-minor" },
  ];

  return (
    <div className="mt-4">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-rule">
        {segments.map((s, i) =>
          s.n > 0 ? (
            <div
              key={i}
              className={s.className}
              style={{ width: `${(s.n / total) * 100}%` }}
            />
          ) : null
        )}
      </div>
      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
        {[
          { l: "Blocking", n: counts.blocking, c: "text-blocking" },
          { l: "Serious", n: counts.serious, c: "text-serious" },
          { l: "Moderate", n: counts.moderate, c: "text-moderate" },
          { l: "Minor", n: counts.minor, c: "text-minor" },
        ].map((x) => (
          <div key={x.l} className="flex items-baseline gap-1.5">
            <dt className={`tag ${x.c}`}>{x.l}</dt>
            <dd className="font-mono text-sm font-medium tabular-nums text-ink">
              {x.n}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function Proof() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <SiteNav />

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <p className="tag text-ink-faint">Proof</p>
        <h1 className="display mt-3 text-4xl leading-[1.1] text-ink sm:text-5xl">
          Receipts, not claims.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
          Every figure below came from running the shipped engine against a real
          target. You can reproduce all of them from the repository.
        </p>

        <div className="mt-14 flex flex-col gap-4">
          {RUNS.map((run) => (
            <article key={run.target} className="rounded-lg border border-rule bg-card p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="display text-xl text-ink">{run.target}</h2>
                <span className="text-sm text-ink-faint">{run.note}</span>
              </div>
              <Bar counts={run.counts} />
              <p className="mt-3 font-mono text-xs text-ink-faint">{run.stats}</p>
              <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
                {run.takeaway}
              </p>
            </article>
          ))}
        </div>

        {/* ---- dogfood ---- */}
        <section
          aria-labelledby="dogfood"
          className="mt-14 rounded-lg border border-clear bg-clear-wash p-6 sm:p-8"
        >
          <p className="tag text-clear">The one that mattered most</p>
          <h2 id="dogfood" className="display mt-2 text-2xl leading-tight text-ink sm:text-3xl">
            We ran Axiom on Axiom.
          </h2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
            It found eight real problems in this very site — no Content Security
            Policy, no frame protection, no share preview, no robots.txt, a
            framework version disclosed in a header, and an 11px label its own
            mobile check flagged as too small to read. All eight are fixed.
          </p>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
            It also caught a bug in itself: bypassing CSP to inject the auditor was
            hiding CSP-caused errors on every site we scanned. That is why the scan
            now runs in two passes.
          </p>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
            The site you are reading is audited the same way. Adding these pages
            introduced a bug immediately — the new navigation shipped 44×23px tap
            targets, one pixel under the WCAG 2.2 minimum — and Axiom&apos;s own
            mobile check caught it before it went out.
          </p>
          <div className="mt-5 overflow-x-auto rounded border border-rule bg-card px-4 py-3">
            <code className="font-mono text-sm text-ink-soft">
              $ npm run scan -- http://localhost:3000
              <br />
              <span className="text-ink-faint">
                4 pages · 28 keyboard stops · 25.9s
              </span>
              <br />
              <span className="text-clear">
                0 blocker · 0 serious · 0 moderate · 0 minor
              </span>
            </code>
          </div>
        </section>

        {/* ---- root cause ---- */}
        <section aria-labelledby="rootcause" className="mt-14 border-t border-rule pt-10">
          <h2 id="rootcause" className="tag text-ink-faint">
            Causes, not symptoms
          </h2>
          <h3 className="display mt-3 text-2xl leading-tight text-ink sm:text-3xl">
            689 symptoms. One finding.
          </h3>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
            On Hacker News, 689 elements across three pages fail contrast — but
            they all inherit the same grey from the same stylesheet. Reporting
            that 689 times is a wall you scroll past. Axiom merges findings by
            cause and lists the places, so you get one line to change.
          </p>
          <div className="mt-5 overflow-x-auto rounded-lg border border-rule bg-card px-5 py-4">
            <pre className="font-mono text-xs leading-relaxed text-ink-soft">
              <code>{`Text is too faint to read              689×   3 pages
  #828282 on #f6f6ef   3.54:1  →  #6f6f6f   4.52:1`}</code>
            </pre>
          </div>
        </section>

        {/* ---- determinism ---- */}
        <section aria-labelledby="math" className="mt-14 border-t border-rule pt-10">
          <h2 id="math" className="tag text-ink-faint">
            Where the answer is computed, not guessed
          </h2>
          <h3 className="display mt-3 text-2xl leading-tight text-ink sm:text-3xl">
            Contrast fixes are solved, not generated.
          </h3>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
            WCAG defines relative luminance as a pure function of sRGB, so the
            minimal correction can be solved for rather than guessed at. Axiom
            binary-searches lightness in HSL space for the smallest shift that
            clears the threshold while preserving hue — no API key, no model call,
            the same answer every run.
          </p>
          <div className="mt-5 overflow-x-auto rounded-lg border border-rule bg-card px-5 py-4">
            <pre className="font-mono text-xs leading-relaxed text-ink-soft">
              <code>{`#777777 on #ffffff   2.85:1  →  #767676   4.54:1   lightness moved 0.4%
#999999 on #ffffff   2.85:1  →  #767676   4.54:1   lightness moved 13.7%
#0000ff on #000000   2.44:1  →  #5e5eff   4.52:1   hue preserved`}</code>
            </pre>
          </div>
          <p className="mt-3 max-w-2xl text-sm text-ink-faint">
            The solver independently arrives at{" "}
            <span className="font-mono text-xs">#767676</span> — the canonical
            minimum-passing grey on white — from a 0.4% shift. Asserted against
            published reference values by{" "}
            <span className="font-mono text-xs">npm run test:contrast</span>.
          </p>
        </section>

        {/* ---- reproduce ---- */}
        <section aria-labelledby="repro" className="mt-14 border-t border-rule pt-10">
          <h2 id="repro" className="tag text-ink-faint">
            Reproduce any of it
          </h2>
          <div className="mt-5 overflow-x-auto rounded-lg border border-rule bg-card px-5 py-4">
            <pre className="font-mono text-xs leading-relaxed text-ink-soft">
              <code>{`git clone https://github.com/thesurajgupta/axiom && cd axiom
npm install && npx playwright install chromium

npm run fixture                  # the demo site, in one terminal
npm run scan -- http://localhost:4321
npm run audit:demo               # the vulnerable codebase
npm run verify:catalog           # the check list matches the engine
npm run test:contrast            # the WCAG maths matches the spec`}</code>
            </pre>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
