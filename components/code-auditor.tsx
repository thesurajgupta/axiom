"use client";

import { useCallback, useRef, useState } from "react";
import type { CodeScanEvent, CodeScanResult } from "@/lib/code/scan";
import { FindingsReport } from "./report";

type Phase = "idle" | "running" | "done" | "error";

/**
 * The code audit is the half of a security review you cannot do from the
 * outside. It runs against source the user owns, and the entire selling point is
 * trust — so the privacy guarantee is stated plainly and enforced by the
 * architecture: the archive is unzipped and scanned in memory on the server and
 * never written to disk, never stored, never sent to a model.
 */
export function CodeAuditor() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [foundCount, setFoundCount] = useState(0);
  const [result, setResult] = useState<CodeScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = useCallback(async (file: File) => {
    setPhase("running");
    setFileName(file.name);
    setLog([]);
    setFoundCount(0);
    setResult(null);
    setError(null);

    try {
      const body = new FormData();
      body.append("project", file);
      const response = await fetch("/api/audit-code", { method: "POST", body });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "The upload was rejected.");
        setPhase("error");
        return;
      }

      // Read the SSE stream from the POST response.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const line = chunk.replace(/^data: /, "").trim();
          if (!line) continue;
          const event: CodeScanEvent = JSON.parse(line);
          if (event.type === "status" && event.message) {
            setLog((prev) => [...prev, event.message!]);
          } else if (event.type === "finding") {
            setFoundCount((n) => n + 1);
          } else if (event.type === "done" && event.result) {
            setResult(event.result);
            setPhase("done");
          }
        }
      }
      setPhase((p) => (p === "running" ? "done" : p));
    } catch {
      setError("The scan connection dropped. Try a smaller archive.");
      setPhase("error");
    }
  }, []);

  const onPick = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".zip")) {
      setError("Please choose a .zip of your project.");
      setPhase("error");
      return;
    }
    run(file);
  };

  const running = phase === "running";

  return (
    <div className="w-full">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!running) onPick(e.dataTransfer.files);
        }}
        className="rounded-lg border border-dashed border-rule-strong bg-card p-8 text-center"
      >
        <p className="display text-lg text-ink">Drop a .zip of your project</p>
        <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-ink-soft">
          Zip your source folder — without <code className="font-mono text-sm">node_modules</code>.
          Axiom reads it for hardcoded secrets, injection, auth gaps, and unsafe
          payment code.
        </p>

        <button
          type="button"
          disabled={running}
          onClick={() => inputRef.current?.click()}
          className="mt-5 rounded-md bg-action px-6 py-2.5 font-semibold text-action-ink disabled:opacity-45"
        >
          {running ? "Scanning…" : "Choose a .zip"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          className="sr-only"
          onChange={(e) => onPick(e.target.files)}
        />
        {fileName && (
          <p className="mt-3 font-mono text-xs text-ink-faint">{fileName}</p>
        )}
      </div>

      {/* The trust statement. On a security tool, this is not fine print. */}
      <p className="mt-3 text-sm leading-relaxed text-ink-faint">
        Your code is unzipped and scanned <strong className="text-ink-soft">in memory</strong>,
        then discarded. Nothing is written to disk, stored, logged, or sent to any
        third party or model. Any secrets found are masked in the report. For a
        zero-upload option, run{" "}
        <code className="font-mono text-ink-soft">npx • the local CLI</code> against
        your folder — the code never leaves your machine.
      </p>

      {(running || log.length > 0) && !result && (
        <section aria-labelledby="code-progress" className="mt-8">
          <h2 id="code-progress" className="sr-only">
            Scan progress
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
          <p className="display text-blocking">Couldn&apos;t scan that</p>
          <p className="mt-1 text-[15px] text-ink-soft">{error}</p>
        </div>
      )}

      {result && (
        <FindingsReport
          view={{
            subject: result.root,
            metaLine: `${result.filesScanned} files scanned locally · nothing stored · ${(result.durationMs / 1000).toFixed(1)}s`,
            cleanMessage:
              `We read ${result.filesScanned} source files and found no hardcoded ` +
              "secrets, injection-shaped code, auth gaps, or unsafe payment " +
              "handling. Clean.",
            findings: result.findings,
            counts: result.counts,
            agentPrompt: result.agentPrompt,
          }}
        />
      )}
    </div>
  );
}
