import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, extname } from "node:path";

/**
 * Walk a project directory and return its text files.
 *
 * Everything downstream of this runs entirely on the local machine: no upload,
 * no network, no model call. That is the whole trust proposition of the code
 * audit — your source is read in place and never leaves. Keeping the walker
 * dependency-free and obvious is part of making that promise auditable.
 */

export interface SourceFile {
  /** Path relative to the project root, for display. */
  path: string;
  /** Absolute path on disk. */
  absPath: string;
  content: string;
  lines: string[];
}

export interface WalkResult {
  files: SourceFile[];
  /** Directories and files skipped, for the "we looked at N of M" honesty. */
  skipped: number;
  root: string;
}

/** Never descend into these — generated, vendored, or version-control internals. */
const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "dist",
  "build",
  "out",
  "coverage",
  ".turbo",
  ".cache",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
  ".terraform",
]);

/** Extensions worth reading as source. Anything else is skipped as binary/noise. */
const TEXT_EXT = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
  ".py", ".rb", ".php", ".go", ".java", ".rs", ".cs",
  ".env", ".json", ".yml", ".yaml", ".toml", ".ini", ".conf",
  ".sh", ".bash", ".zsh",
  ".sql", ".prisma", ".graphql",
  ".html", ".vue", ".svelte", ".astro",
  ".tf", ".dockerfile",
]);

/** Filenames that are always worth reading regardless of extension. */
const TEXT_NAMES = new Set([
  ".env", ".env.local", ".env.production", ".env.development",
  "dockerfile", "makefile", ".npmrc", ".dockerignore",
  "package.json", "requirements.txt", "gemfile", "go.mod",
]);

/** Skip any single file larger than this — minified bundles, data dumps. */
const MAX_FILE_BYTES = 1_500_000;
/** Overall ceiling so an enormous repo cannot exhaust memory. */
const MAX_TOTAL_FILES = 5_000;

function isTextFile(name: string): boolean {
  const lower = name.toLowerCase();
  if (TEXT_NAMES.has(lower)) return true;
  const ext = extname(lower);
  if (TEXT_EXT.has(ext)) return true;
  // dotfiles like .env.staging that TEXT_NAMES misses.
  if (lower.startsWith(".env")) return true;
  return false;
}

export async function walkProject(root: string): Promise<WalkResult> {
  const files: SourceFile[] = [];
  let skipped = 0;

  async function descend(dir: string): Promise<void> {
    if (files.length >= MAX_TOTAL_FILES) return;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (EXCLUDE_DIRS.has(entry.name)) {
          skipped++;
          continue;
        }
        await descend(full);
        continue;
      }

      if (!entry.isFile()) continue;
      if (!isTextFile(entry.name)) {
        skipped++;
        continue;
      }

      try {
        const info = await stat(full);
        if (info.size > MAX_FILE_BYTES) {
          skipped++;
          continue;
        }
        const content = await readFile(full, "utf8");
        // Skip anything that looks minified: one very long line is a bundle,
        // not source a human wrote, and it produces only false positives.
        if (/[^\n]{5000,}/.test(content)) {
          skipped++;
          continue;
        }
        files.push({
          path: relative(root, full) || entry.name,
          absPath: full,
          content,
          lines: content.split("\n"),
        });
      } catch {
        skipped++;
      }
    }
  }

  await descend(root);
  return { files, skipped, root };
}
