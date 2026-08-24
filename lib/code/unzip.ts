import { unzipSync } from "fflate";
import { extname } from "node:path";
import type { SourceFile } from "./walk";

/**
 * Unzip an uploaded archive entirely in memory and return its text files.
 *
 * The user's code is never written to disk here. It is decompressed in RAM,
 * scanned, and discarded when the request ends. That is the strongest version
 * of the privacy promise: there is nothing to leak because nothing is stored.
 *
 * Because the input is untrusted, every limit below is a safety boundary, not a
 * tuning knob:
 *   - a cap on total uncompressed size defends against a zip bomb
 *   - a cap on entry count defends against a bomb made of many tiny files
 *   - path-traversal and absolute paths are rejected outright
 */

const MAX_TOTAL_UNCOMPRESSED = 80 * 1024 * 1024; // 80 MB
const MAX_ENTRIES = 8_000;
const MAX_FILE_BYTES = 1_500_000;

const EXCLUDE_DIR = /(^|\/)(node_modules|\.git|\.next|dist|build|out|coverage|vendor|__pycache__|\.venv|venv)(\/|$)/;

const TEXT_EXT = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
  ".py", ".rb", ".php", ".go", ".java", ".rs", ".cs",
  ".env", ".json", ".yml", ".yaml", ".toml", ".ini", ".conf",
  ".sh", ".bash", ".sql", ".prisma", ".graphql",
  ".html", ".vue", ".svelte", ".astro", ".tf",
]);

const TEXT_NAMES = new Set([
  "dockerfile", "makefile", ".npmrc", "package.json",
  "requirements.txt", "gemfile", "go.mod", ".gitignore",
]);

function isTextFile(name: string): boolean {
  const lower = name.toLowerCase();
  if (TEXT_NAMES.has(lower)) return true;
  if (lower.startsWith(".env")) return true;
  return TEXT_EXT.has(extname(lower));
}

function isUnsafePath(path: string): boolean {
  return (
    path.includes("..") ||
    path.startsWith("/") ||
    path.startsWith("\\") ||
    /^[a-zA-Z]:/.test(path) // Windows drive letter
  );
}

export interface UnzipResult {
  files: SourceFile[];
  skipped: number;
  /** Common leading directory (archives usually wrap everything in one folder). */
  rootLabel: string;
}

export function unzipToSourceFiles(archive: Uint8Array): UnzipResult {
  const entries = unzipSync(archive, {
    filter: (file) =>
      file.name.length < 400 &&
      !file.name.endsWith("/") &&
      file.originalSize <= MAX_FILE_BYTES &&
      !EXCLUDE_DIR.test(file.name),
  });

  const decoder = new TextDecoder("utf8", { fatal: false });
  const files: SourceFile[] = [];
  let skipped = 0;
  let total = 0;
  let count = 0;

  for (const [name, bytes] of Object.entries(entries)) {
    if (count++ > MAX_ENTRIES) break;

    if (isUnsafePath(name)) {
      skipped++;
      continue;
    }
    if (!isTextFile(name.split("/").pop() ?? name)) {
      skipped++;
      continue;
    }

    total += bytes.length;
    if (total > MAX_TOTAL_UNCOMPRESSED) break;

    const content = decoder.decode(bytes);
    // One extremely long line is a minified bundle, not authored source.
    if (/[^\n]{5000,}/.test(content)) {
      skipped++;
      continue;
    }

    files.push({
      path: name,
      absPath: name,
      content,
      lines: content.split("\n"),
    });
  }

  // Strip a common top-level folder so paths read as project-relative.
  const rootLabel = commonPrefix(files.map((f) => f.path));
  if (rootLabel) {
    for (const f of files) f.path = f.path.slice(rootLabel.length);
  }

  return { files, skipped, rootLabel: rootLabel.replace(/\/$/, "") || "your project" };
}

function commonPrefix(paths: string[]): string {
  if (paths.length === 0) return "";
  const first = paths[0].split("/")[0];
  if (!first) return "";
  return paths.every((p) => p.startsWith(first + "/")) ? first + "/" : "";
}
