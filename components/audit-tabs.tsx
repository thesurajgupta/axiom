"use client";

import { useState } from "react";
import { Auditor } from "./auditor";
import { CodeAuditor } from "./code-auditor";

type Mode = "site" | "code";

/**
 * Two audits, one product. The live audit uses a running site; the code audit
 * reads source the user uploads. They answer different questions — "does this
 * work for my users?" versus "is this safe to ship?" — so they get equal billing
 * rather than one being buried.
 */
export function AuditTabs({
  examples,
}: {
  examples: { label: string; url: string }[];
}) {
  const [mode, setMode] = useState<Mode>("site");

  const tabs: Array<{ value: Mode; label: string; sub: string }> = [
    { value: "site", label: "Audit a live site", sub: "A URL. What users hit." },
    { value: "code", label: "Audit your code", sub: "A .zip. What's in the source." },
  ];

  return (
    <div>
      <div role="tablist" aria-label="Audit type" className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const active = mode === tab.value;
          return (
            <button
              key={tab.value}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setMode(tab.value)}
              className={`flex-1 rounded-lg border px-4 py-3 text-left ${
                active
                  ? "border-action bg-card"
                  : "border-rule bg-card hover:border-rule-strong"
              }`}
            >
              <span className="block font-semibold text-ink">{tab.label}</span>
              <span className="mt-0.5 block text-xs text-ink-faint">{tab.sub}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-8">
        {mode === "site" ? <Auditor examples={examples} /> : <CodeAuditor />}
      </div>
    </div>
  );
}
