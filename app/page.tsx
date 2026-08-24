import { AuditTabs } from "@/components/audit-tabs";

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

      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-4">
          <span className="display text-[15px] tracking-tight">Axiom</span>
          <span className="tag ml-auto text-ink-faint">Pre-launch audit</span>
        </div>
      </header>

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

        <div className="mt-12">
          <AuditTabs examples={EXAMPLES} />
        </div>

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

      <footer className="border-t border-rule">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <p className="text-sm text-ink-faint">
            Axiom audits a single page per run. It reports what it observed, and
            says plainly when something needs a person instead.
          </p>
        </div>
      </footer>
    </>
  );
}
