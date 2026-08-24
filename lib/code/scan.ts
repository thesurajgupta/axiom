import {
  countBySeverity,
  mergeFindings,
  sortFindings,
  type Finding,
} from "../findings";
import { buildAgentPrompt } from "../prompt";
import { scanDependencies } from "./deps";
import { scanPatterns } from "./patterns";
import { scanSecrets } from "./secrets";
import { walkProject, type SourceFile } from "./walk";

/**
 * Audit a project's source code, entirely on the local machine.
 *
 * This is the half of a security review you cannot do from the outside: reading
 * the code for hardcoded secrets, injection-shaped queries, auth routes with no
 * rate limiting, payment amounts trusted from the client. It is legal and safe
 * precisely because it never touches anyone's running server — it reads files
 * the operator already owns.
 *
 * Nothing here makes a network request. Your source is read in place and never
 * transmitted, stored, or sent to a model.
 */

export interface CodeScanResult {
  root: string;
  scannedAt: string;
  filesScanned: number;
  filesSkipped: number;
  findings: Finding[];
  counts: ReturnType<typeof countBySeverity>;
  agentPrompt: string;
  durationMs: number;
}

export interface CodeScanEvent {
  type: "status" | "finding" | "done";
  message?: string;
  finding?: Finding;
  result?: CodeScanResult;
}

/**
 * Scan an in-memory set of files. This is the path the web upload uses: the
 * uploaded archive is unzipped in RAM and scanned here, so the user's source is
 * never written to our disk, never persisted, and never sent onward.
 */
export function scanFiles(
  files: SourceFile[],
  meta: { root: string; skipped: number },
  onEvent?: (event: CodeScanEvent) => void
): CodeScanResult {
  const startedAt = Date.now();
  const emit = (event: CodeScanEvent) => onEvent?.(event);

  emit({
    type: "status",
    message: `Read ${files.length} source files. Scanning for hardcoded secrets…`,
  });
  const secrets = scanSecrets(files);

  emit({
    type: "status",
    message: "Scanning for injection, auth and payment issues…",
  });
  const patterns = scanPatterns(files);

  emit({ type: "status", message: "Checking dependencies and config…" });
  const deps = scanDependencies(files);

  const all = [...secrets, ...patterns, ...deps];
  const merged = sortFindings(mergeFindings(all));

  for (const finding of merged) emit({ type: "finding", finding });

  const result: CodeScanResult = {
    root: meta.root,
    scannedAt: new Date().toISOString(),
    filesScanned: files.length,
    filesSkipped: meta.skipped,
    findings: merged,
    counts: countBySeverity(merged),
    agentPrompt: buildAgentPrompt(meta.root, merged),
    durationMs: Date.now() - startedAt,
  };

  emit({ type: "done", result });
  return result;
}

export async function scanCode(
  root: string,
  onEvent?: (event: CodeScanEvent) => void
): Promise<CodeScanResult> {
  const emit = (event: CodeScanEvent) => onEvent?.(event);

  emit({ type: "status", message: "Reading your project files…" });
  const { files, skipped } = await walkProject(root);
  return scanFiles(files, { root, skipped }, onEvent);
}
