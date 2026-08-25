import Link from "next/link";

const LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/checks", label: "Checks" },
  { href: "/proof", label: "Proof" },
];

export function SiteNav() {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
        <Link
          href="/"
          className="display inline-flex min-h-[28px] items-center text-[15px] tracking-tight text-ink"
        >
          Axiom
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex min-h-[28px] items-center text-sm text-ink-soft hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <a
          href="https://github.com/thesurajgupta/axiom"
          className="ml-auto inline-flex min-h-[28px] items-center text-sm text-ink-soft hover:text-ink"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-rule">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <p className="max-w-2xl text-sm leading-relaxed text-ink-faint">
          Axiom reports what it observed, and says plainly when something needs a
          person instead. It never attacks a running server — the live audit reads
          only what a page volunteers to any browser, and the code audit reads
          source you own, on your own machine.
        </p>
      </div>
    </footer>
  );
}
