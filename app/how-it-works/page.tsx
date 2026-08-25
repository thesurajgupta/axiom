import type { Metadata } from "next";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { TOTAL_CHECK_COUNT } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "How Axiom works",
  description:
    "The mechanism behind the audit: a two-pass browser architecture, a real keyboard walk, root-cause merging, and static analysis that never leaves your machine.",
};

function Step({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-5">
      <div
        aria-hidden="true"
        className="tag mt-1 shrink-0 tabular-nums text-ink-faint"
      >
        {n}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="display text-lg text-ink sm:text-xl">{title}</h3>
        <div className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function HowItWorks() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <SiteNav />

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <p className="tag text-ink-faint">How it works</p>
        <h1 className="display mt-3 text-4xl leading-[1.1] text-ink sm:text-5xl">
          It doesn&apos;t read your site.
          <br />
          It uses it.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
          Every other tool in this category parses your HTML and checks it against
          rules. That finds mechanical faults and misses the failures that
          actually lock people out. Axiom drives a real browser and a real
          keyboard, then reads your source for what a browser can never see.
        </p>

        {/* ---- the pipeline ---- */}
        <section aria-labelledby="pipeline" className="mt-16 border-t border-rule pt-10">
          <h2 id="pipeline" className="tag text-ink-faint">
            The live-site pipeline
          </h2>

          <div className="mt-8 flex flex-col gap-9">
            <Step n="01" title="Map the site">
              A breadth-first crawl from your entry URL, staying on one origin and
              honouring <span className="font-mono text-sm">robots.txt</span>.
              Breadth-first matters: it reaches the pages linked from your
              homepage — the ones users actually see — before descending into
              archives. Concurrency is capped at three pages, with a page cap and
              a wall-clock budget on top.
            </Step>

            <Step n="02" title="Observe each page under its real security policy">
              Runtime listeners are attached <em>before</em> navigation, so the
              earliest and most interesting errors are captured rather than
              missed. This pass never bypasses your Content Security Policy — the
              reason why is below.
            </Step>

            <Step n="03" title="Instrument, then operate the page">
              A second pass injects the accessibility engine and then presses{" "}
              <span className="font-mono text-sm">Tab</span>, over and over,
              recording every element focus lands on: its position, its label, and
              whether focusing it visibly changed anything at all.
            </Step>

            <Step n="04" title="Re-render it on a phone">
              The same page at 390×844, measured for content running off the edge,
              tap targets under 24px, and text under 12px.
            </Step>

            <Step n="05" title="Request every link">
              Each unique URL discovered anywhere on the site, checked once —{" "}
              <span className="font-mono text-sm">HEAD</span> first, falling back
              to <span className="font-mono text-sm">GET</span> for servers that
              reject it — and reported with the pages that link to it.
            </Step>

            <Step n="06" title="Merge symptoms into causes">
              The same faint grey appears on every page sharing a stylesheet.
              That is one problem with forty symptoms, so it is reported once,
              with the list of places — not forty times.
            </Step>
          </div>
        </section>

        {/* ---- the two-pass insight ---- */}
        <section aria-labelledby="twopass" className="mt-16 border-t border-rule pt-10">
          <h2 id="twopass" className="tag text-ink-faint">
            The part we got wrong first
          </h2>
          <h3 className="display mt-3 text-2xl leading-tight text-ink sm:text-3xl">
            Bypassing CSP hides the bugs CSP causes.
          </h3>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
            To inject an audit harness into a page you have to bypass its Content
            Security Policy. But a site whose CSP blocks its own scripts looks{" "}
            <em>perfectly healthy</em> through a bypassed browser — the very
            failure you want to find is the one you just suppressed.
          </p>

          <figure className="mt-7">
            <svg
              viewBox="0 0 640 232"
              className="w-full"
              role="img"
              aria-label="Diagram: pass one loads the page under its real Content Security Policy to collect runtime errors; pass two bypasses CSP only to inject the auditor and drive the keyboard. Findings from both merge into one report."
            >
              <defs>
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--rule-strong)" />
                </marker>
              </defs>

              <rect x="1" y="14" width="196" height="86" rx="10"
                fill="var(--card)" stroke="var(--rule)" />
              <text x="18" y="42" fill="var(--ink)" fontSize="14" fontWeight="700">Pass 1 — observe</text>
              <text x="18" y="63" fill="var(--ink-soft)" fontSize="12">CSP left intact</text>
              <text x="18" y="82" fill="var(--ink-soft)" fontSize="12">console · network · timing</text>

              <rect x="1" y="126" width="196" height="86" rx="10"
                fill="var(--card)" stroke="var(--rule)" />
              <text x="18" y="154" fill="var(--ink)" fontSize="14" fontWeight="700">Pass 2 — instrument</text>
              <text x="18" y="175" fill="var(--ink-soft)" fontSize="12">CSP bypassed</text>
              <text x="18" y="194" fill="var(--ink-soft)" fontSize="12">axe · keyboard walk</text>

              <line x1="205" y1="57" x2="268" y2="100" stroke="var(--rule-strong)"
                strokeWidth="1.5" markerEnd="url(#arrow)" />
              <line x1="205" y1="169" x2="268" y2="126" stroke="var(--rule-strong)"
                strokeWidth="1.5" markerEnd="url(#arrow)" />

              <rect x="276" y="84" width="150" height="58" rx="10"
                fill="var(--card)" stroke="var(--rule)" />
              <text x="292" y="110" fill="var(--ink)" fontSize="14" fontWeight="700">Merge</text>
              <text x="292" y="129" fill="var(--ink-soft)" fontSize="12">by root cause</text>

              <line x1="434" y1="113" x2="492" y2="113" stroke="var(--rule-strong)"
                strokeWidth="1.5" markerEnd="url(#arrow)" />

              <rect x="500" y="84" width="138" height="58" rx="10"
                fill="var(--card)" stroke="var(--action)" />
              <text x="516" y="110" fill="var(--ink)" fontSize="14" fontWeight="700">One report</text>
              <text x="516" y="129" fill="var(--ink-soft)" fontSize="12">+ agent prompt</text>
            </svg>
            <figcaption className="mt-3 text-sm text-ink-faint">
              We found this by running Axiom on Axiom: the single-pass version
              reported our own site clean while a console error sat in the browser.
            </figcaption>
          </figure>
        </section>

        {/* ---- keyboard walk ---- */}
        <section aria-labelledby="keyboard" className="mt-16 border-t border-rule pt-10">
          <h2 id="keyboard" className="tag text-ink-faint">
            The keyboard walk
          </h2>
          <h3 className="display mt-3 text-2xl leading-tight text-ink sm:text-3xl">
            A button nobody can reach is invisible in the markup.
          </h3>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
            A <span className="font-mono text-sm">&lt;div&gt;</span> with a click
            handler works perfectly with a mouse and does not exist for anyone
            without one. No parser can tell you that. So Axiom presses Tab through
            the entire page, records every stop, and compares what it reached
            against everything on the page that behaves like a control.
          </p>

          <div className="mt-6 overflow-x-auto rounded-lg border border-rule bg-card">
            <pre className="px-5 py-4 font-mono text-xs leading-relaxed text-ink-soft">
              <code>{`tab  1  → input[email]           focus ring: none      ⚠
tab  2  → input[text]            focus ring: none      ⚠
tab  3  → button "Start trial"   focus ring: visible   ✓
tab  4  → a "Docs"               focus ring: visible   ✓
        ── sequence complete, 4 stops ──

never reached:
  <div>  "Sign up free"   click handler, not a control
  <span> "Dismiss"        role="button", no tabindex`}</code>
            </pre>
          </div>
          <p className="mt-3 text-sm text-ink-faint">
            The walk is driven through real key events, not{" "}
            <span className="font-mono text-xs">element.focus()</span>, because
            only real keypresses exercise the browser&apos;s actual focus
            algorithm — including tabindex, traps, and handlers that intercept
            keydown.
          </p>
        </section>

        {/* ---- code audit ---- */}
        <section aria-labelledby="code" className="mt-16 border-t border-rule pt-10">
          <h2 id="code" className="tag text-ink-faint">
            The code audit
          </h2>
          <h3 className="display mt-3 text-2xl leading-tight text-ink sm:text-3xl">
            The bugs a browser can never see.
          </h3>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
            You cannot test for SQL injection or a missing rate limit from
            outside — and you should never fire payloads at a server you do not
            own. With the source, you read the vulnerability directly. That is
            static analysis, and it is both legal and more thorough: it sees every
            route, not just the ones a crawler can reach.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              { t: "Walk", d: "Your files, skipping node_modules, build output and minified bundles." },
              { t: "Scan", d: "Secret patterns, injection and auth shapes, dependency and config checks." },
              { t: "Mask", d: "Every secret reduced to a prefix and three characters before display." },
            ].map((s) => (
              <div key={s.t} className="rounded-lg border border-rule bg-card p-4">
                <p className="display text-base text-ink">{s.t}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{s.d}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-lg border border-clear bg-clear-wash px-5 py-4">
            <p className="text-[15px] leading-relaxed text-ink-soft">
              <span className="text-ink">Your code never leaves your machine.</span>{" "}
              The CLI runs entirely locally and makes no network calls at all. The
              web upload unzips in memory, scans, and discards — nothing is written
              to disk, stored, logged, or sent to any model.
            </p>
          </div>
        </section>

        {/* ---- honesty ---- */}
        <section aria-labelledby="honesty" className="mt-16 border-t border-rule pt-10">
          <h2 id="honesty" className="tag text-ink-faint">
            Where it refuses
          </h2>
          <div className="mt-5 flex flex-col gap-4">
            {[
              {
                t: "It will not invent alt text",
                d: "For an image it cannot interpret, it says a human is needed. A plausible-sounding alt attribute silences the audit while lying to the screen-reader user it was meant to help.",
              },
              {
                t: "It reports shapes, not proofs",
                d: "Pattern analysis says what dangerous shape it detected — never that something is proven exploitable. Its job is to put your eyes on the twelve lines that deserve them.",
              },
              {
                t: "It will not attack anything",
                d: "No probing rate limits, forcing logins, or firing injection payloads. Everything it reports, it observed from what a page and its server volunteer to any browser.",
              },
            ].map((x) => (
              <div key={x.t} className="border-l-2 border-rule-strong pl-4">
                <p className="display text-base text-ink">{x.t}</p>
                <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
                  {x.d}
                </p>
              </div>
            ))}
          </div>
        </section>

        <p className="mt-14 text-[15px] text-ink-soft">
          {TOTAL_CHECK_COUNT} checks run on every audit —{" "}
          <a href="/checks" className="text-action underline underline-offset-2">
            see the full list
          </a>
          .
        </p>
      </main>

      <SiteFooter />
    </>
  );
}
