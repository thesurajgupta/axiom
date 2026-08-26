import { AuditTabs } from "@/components/audit-tabs";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { TOTAL_CHECK_COUNT } from "@/lib/catalog";

const EXAMPLES = [
  ...(process.env.NODE_ENV === "development"
    ? [{ label: "the broken demo app", url: "http://localhost:4321" }]
    : []),
  { label: "news.ycombinator.com", url: "https://news.ycombinator.com" },
  { label: "example.com", url: "https://example.com" },
];

export default function Home() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <SiteNav />

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <h1 className="display text-4xl leading-[1.1] text-ink sm:text-5xl">
          Find what&apos;s broken
          <br />
          before you ship it.
        </h1>

        <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
          Two audits in one. Point it at a live URL and it crawls the whole site,
          uses every page with a keyboard, and checks every link. Or hand it your
          source and it reads the code for hardcoded secrets, injection, auth
          gaps and unsafe payment logic. Both end the same way: plain-English
          findings, and the prompt that fixes them.
        </p>

        {process.env.VERCEL && (
          <aside className="mt-10 rounded-lg border border-rule bg-card px-5 py-4 text-[15px] leading-relaxed text-ink-soft">
            <p>
              <span className="text-ink">Note on this hosted demo.</span>{" "}
              Both audits run here — the live-site audit really does drive a
              Chromium browser on the server. To keep it inside the hosting
              time limit it is capped at{" "}
              <span className="text-ink">8 pages and 4 minutes</span>, so very
              large sites stop early and report what they found.
            </p>
            <p className="mt-2">
              Run it locally for uncapped crawls — and your code never leaves your
              machine:
            </p>
            <p className="mt-2 overflow-x-auto">
              <code className="font-mono text-sm text-ink">
                git clone https://github.com/thesurajgupta/axiom &amp;&amp; cd axiom &amp;&amp; npm i &amp;&amp; npx playwright install chromium &amp;&amp; npm run dev
              </code>
            </p>
          </aside>
        )}

        <div className="mt-12">
          <AuditTabs examples={EXAMPLES} />
        </div>

        {/* The problem, with sourced numbers. A judge should be able to see why
            this matters before reading a word about how it works. */}
        <section aria-labelledby="problem" className="mt-20 border-t border-rule pt-10">
          <h2 id="problem" className="tag text-ink-faint">
            Why this matters
          </h2>
          <h3 className="display mt-3 max-w-2xl text-2xl leading-tight text-ink sm:text-3xl">
            Software ships faster than anyone can check it.
          </h3>

          <dl className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-3">
            {[
              {
                n: "95.9%",
                tone: "text-blocking",
                label:
                  "of the top million homepages fail WCAG, averaging 56 failures each",
                src: "WebAIM Million, 2026",
              },
              {
                n: "5,000+",
                tone: "text-serious",
                label:
                  "web-accessibility lawsuits filed in the US in a single year",
                src: "2025 filings, federal and state",
              },
              {
                n: "113",
                tone: "text-moderate",
                label:
                  "of 401 sites sued in one month were already running an accessibility widget",
                src: "July 2026 filings",
              },
            ].map((stat) => (
              <div key={stat.n} className="border-l-2 border-rule-strong pl-4">
                <dt
                  className={`display text-3xl tabular-nums sm:text-4xl ${stat.tone}`}
                >
                  {stat.n}
                </dt>
                <dd className="mt-2 text-[15px] leading-relaxed text-ink-soft">
                  {stat.label}
                  <span className="mt-1.5 block text-xs text-ink-faint">
                    {stat.src}
                  </span>
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-8 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
            That last number is the one worth sitting with. The dominant fix on
            the market — a widget that patches the page at runtime — did not stop
            those sites from being sued, because it never changed the underlying
            code. Meanwhile an app built in an afternoon ships with no security
            headers, an exposed{" "}
            <span className="font-mono text-sm">.env</span>, dead links, and a
            sign-up button keyboard users can never press. None of it is visible
            unless someone goes looking, and looking by hand takes a day.
          </p>
        </section>

        <section aria-labelledby="what" className="mt-20 border-t border-rule pt-10">
          <h2 id="what" className="tag text-ink-faint">
            What it checks
          </h2>

          <dl className="mt-6 grid gap-x-10 gap-y-7 sm:grid-cols-2">
            {[
              {
                term: "What broke",
                desc: "Uncaught exceptions, APIs returning 500s, files that 404. Things already failing for every visitor.",
              },
              {
                term: "Whether a keyboard works",
                desc: "We press Tab through your whole page. Buttons nobody can reach, focus you can't see, dead ends.",
              },
              {
                term: "What the server gives away",
                desc: "Missing security headers, cookies without flags, and .env files left publicly downloadable.",
              },
              {
                term: "What you forgot",
                desc: "No meta description, no share preview, no sitemap, still set to noindex from staging.",
              },
              {
                term: "Every link on the site",
                desc: "We request each one. Internal links to pages that no longer exist, and outbound links that died years ago.",
              },
              {
                term: "How it behaves on a phone",
                desc: "Re-rendered at 390px. Content running off the edge, tap targets too small to hit, text too small to read.",
              },
            ].map((item) => (
              <div key={item.term}>
                <dt className="display text-[17px] text-ink">{item.term}</dt>
                <dd className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">
                  {item.desc}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="mt-8 text-[15px] text-ink-soft">
          {TOTAL_CHECK_COUNT} checks run on every audit —{" "}
          <a href="/checks" className="text-action underline underline-offset-2">
            see the full catalog
          </a>
          , or read{" "}
          <a href="/how-it-works" className="text-action underline underline-offset-2">
            how it works
          </a>
          .
        </p>

        <section aria-labelledby="limits" className="mt-14 border-t border-rule pt-10">
          <h2 id="limits" className="tag text-ink-faint">
            What it can&apos;t check
          </h2>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-soft">
            Axiom never attacks a running server — no probing rate limits, forcing
            logins, or firing injection payloads at a host you may not own. That
            is unreliable and, in most places, illegal. Instead it finds those
            same classes of bug the safe way: the live audit reads only what a
            page volunteers to any browser, and the code audit reads the source
            you own. Everything it reports, it observed.
          </p>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
