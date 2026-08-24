"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ScanEvent, ScanResult } from "@/lib/scan";
import { Report } from "./report";

type Phase = "idle" | "running" | "done" | "error";

export function Auditor({
  examples,
}: {
  examples: { label: string; url: string }[];
}) {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [depth, setDepth] = useState<"site" | "page">("site");
  const [log, setLog] = useState<string[]>([]);
  const [pageProgress, setPageProgress] = useState<{
    url: string;
    index: number;
    total: number;
  } | null>(null);
  const [foundCount, setFoundCount] = useState(0);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => () => sourceRef.current?.close(), []);

  const start = useCallback((target: string, mode: "site" | "page") => {
    const trimmed = target.trim();
    if (!trimmed) return;

    const normalised = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    sourceRef.current?.close();
    setPhase("running");
    setLog([]);
    setPageProgress(null);
    setFoundCount(0);
    setResult(null);
    setError(null);

    const source = new EventSource(
      `/api/scan?url=${encodeURIComponent(normalised)}&depth=${mode}`
    );
    sourceRef.current = source;

    source.onmessage = (message) => {
      const event: ScanEvent = JSON.parse(message.data);
      switch (event.type) {
        case "status":
          // Progress messages update in place rather than stacking up.
          setLog((prev) => {
            const stem = event.message.split("…")[0];
            const last = prev[prev.length - 1];
            if (last && last.split("…")[0] === stem) {
              return [...prev.slice(0, -1), event.message];
            }
            return [...prev, event.message];
          });
          break;
        case "page":
          setPageProgress({
            url: event.url,
            index: event.index,
            total: event.total,
          });
          break;
        case "finding":
          setFoundCount((n) => n + 1);
          break;
        case "done":
          setResult(event.result);
          setPhase("done");
          source.close();
          break;
        case "error":
          setError(event.message);
          setPhase("error");
          source.close();
          break;
      }
    };

    source.onerror = () => {
      source.close();
      setPhase((current) => {
        if (current === "done") return current;
        setError(
          "The connection dropped before the audit finished. The site may be slow, or blocking automated browsers."
        );
        return "error";
      });
    };
  }, []);

  const running = phase === "running";

  return (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(url, depth);
        }}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label htmlFor="url" className="tag mb-2 block text-ink-faint">
            Your site
          </label>
          <input
            id="url"
            name="url"
            type="text"
            inputMode="url"
            autoComplete="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="yoursite.com"
            disabled={running}
            className="w-full rounded-md border border-rule-strong bg-card px-4 py-3 font-mono text-[15px] text-ink placeholder:text-ink-faint disabled:opacity-60"
          />
        </div>
        <button
          type="submit"
          disabled={running || !url.trim()}
          className="h-[50px] shrink-0 rounded-md bg-action px-7 font-semibold text-action-ink disabled:cursor-not-allowed disabled:opacity-45"
        >
          {running ? "Auditing…" : "Audit my site"}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-faint">Or try:</span>
        {examples.map((example) => (
          <button
            key={example.url}
            type="button"
            disabled={running}
            onClick={() => {
              setUrl(example.url);
              start(example.url, depth);
            }}
            className="rounded-full border border-rule px-3 py-1 font-mono text-xs text-ink-soft hover:border-rule-strong hover:text-ink disabled:opacity-50"
          >
            {example.label}
          </button>
        ))}
      </div>

      <fieldset className="mt-6 border-0 p-0">
        <legend className="tag mb-2 text-ink-faint">How deep</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              {
                value: "site" as const,
                label: "Whole site",
                hint: "Crawls your pages, checks every link. Minutes.",
              },
              {
                value: "page" as const,
                label: "This page only",
                hint: "One page. Seconds.",
              },
            ]
          ).map((option) => (
            <label
              key={option.value}
              className={`cursor-pointer rounded-md border px-4 py-2.5 ${
                depth === option.value
                  ? "border-action bg-card"
                  : "border-rule bg-card hover:border-rule-strong"
              } ${running ? "opacity-60" : ""}`}
            >
              <input
                type="radio"
                name="depth"
                value={option.value}
                checked={depth === option.value}
                disabled={running}
                onChange={() => setDepth(option.value)}
                className="sr-only"
              />
              <span className="block text-sm font-semibold text-ink">
                {option.label}
              </span>
              <span className="mt-0.5 block text-xs text-ink-faint">
                {option.hint}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {(running || log.length > 0) && !result && (
        <section aria-labelledby="progress" className="mt-8">
          <h2 id="progress" className="sr-only">
            Audit progress
          </h2>
          <div
            role="status"
            aria-live="polite"
            className="rounded-lg border border-rule bg-card px-5 py-4"
          >
            {log.map((line, i) => {
              const isLast = i === log.length - 1;
              return (
                <p
                  key={i}
                  className={`py-0.5 font-mono text-sm ${
                    isLast && running ? "breathe text-ink" : "text-ink-faint"
                  }`}
                >
                  {line}
                </p>
              );
            })}
            {pageProgress && (
              <div className="mt-3 border-t border-rule pt-3">
                <div
                  className="h-1 w-full overflow-hidden rounded-full bg-rule"
                  role="progressbar"
                  aria-valuenow={pageProgress.index}
                  aria-valuemin={0}
                  aria-valuemax={pageProgress.total}
                  aria-label="Pages audited"
                >
                  <div
                    className="h-full bg-action"
                    style={{
                      width: `${(pageProgress.index / pageProgress.total) * 100}%`,
                    }}
                  />
                </div>
                <p className="mt-2 truncate font-mono text-xs text-ink-faint">
                  page {pageProgress.index} of {pageProgress.total} ·{" "}
                  {pathOf(pageProgress.url)}
                </p>
              </div>
            )}

            {foundCount > 0 && (
              <p className="mt-3 border-t border-rule pt-3 font-mono text-sm text-ink">
                {foundCount} finding{foundCount === 1 ? "" : "s"} so far
              </p>
            )}
          </div>
        </section>
      )}

      {error && (
        <div
          role="alert"
          className="mt-8 rounded-lg border border-blocking bg-blocking-wash px-5 py-4"
        >
          <p className="display text-blocking">Audit didn&apos;t finish</p>
          <p className="mt-1 text-[15px] text-ink-soft">{error}</p>
        </div>
      )}

      {result && <Report result={result} />}
    </div>
  );
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
