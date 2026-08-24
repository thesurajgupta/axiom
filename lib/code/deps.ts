import type { Finding } from "../findings";
import type { SourceFile } from "./walk";

/**
 * Dependency and configuration checks — entirely offline.
 *
 * These read the project's own manifest and config files. Nothing here contacts
 * a registry or sends your dependency list anywhere, which keeps the "your code
 * never leaves the machine" promise airtight. (A CVE lookup would mean shipping
 * your package names to a third party; that is deliberately left as an explicit,
 * separate opt-in rather than folded in here.)
 */

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

function parseJson<T>(content: string): T | null {
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export function scanDependencies(files: SourceFile[]): Finding[] {
  const findings: Finding[] = [];

  const pkgFile = files.find((f) => f.path === "package.json");
  const hasLockfile = files.some((f) =>
    ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb"].includes(
      f.path.split("/").pop() ?? ""
    )
  );

  if (pkgFile) {
    const pkg = parseJson<PackageJson>(pkgFile.content);

    if (pkg) {
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Dependencies pulled straight from a git URL or the web bypass the
      // registry's integrity checks and can change under you without a version
      // bump — a well-known supply-chain vector.
      const nonRegistry = Object.entries(allDeps).filter(([, version]) =>
        /^(?:git\+|https?:|github:|git:)/.test(version)
      );
      if (nonRegistry.length > 0) {
        findings.push({
          id: "dep-non-registry",
          category: "code",
          severity: "moderate",
          title: `${nonRegistry.length} dependenc${nonRegistry.length === 1 ? "y is" : "ies are"} installed from a URL, not the registry`,
          detail:
            "These are pulled directly from git or the web, so they skip the " +
            "registry's integrity checks and can change silently. If that " +
            "account or host is ever compromised, the code runs in your build.",
          evidence: nonRegistry
            .slice(0, 6)
            .map(([name, version]) => `${name}: ${version}`)
            .join("\n"),
          location: "package.json",
          count: nonRegistry.length,
          fix:
            "Prefer published registry versions. If you must use a git " +
            "dependency, pin it to a commit hash, not a branch.",
        });
      }

      // A postinstall script is how a malicious or compromised package gets to
      // run code on every machine that installs the project. Worth a glance.
      if (pkg.scripts?.postinstall || pkg.scripts?.preinstall) {
        findings.push({
          id: "dep-install-script",
          category: "code",
          severity: "minor",
          title: "The project runs a script on install",
          detail:
            "A pre/postinstall script executes automatically whenever anyone " +
            "runs npm install. That is legitimate for some tools, but it is also " +
            "the mechanism supply-chain attacks use, so it is worth confirming " +
            "you know what it does.",
          evidence: [
            pkg.scripts.preinstall && `preinstall: ${pkg.scripts.preinstall}`,
            pkg.scripts.postinstall && `postinstall: ${pkg.scripts.postinstall}`,
          ]
            .filter(Boolean)
            .join("\n"),
          location: "package.json",
          fix: "Confirm the script is one you intend to run. Remove it if not.",
        });
      }
    }

    if (!hasLockfile) {
      findings.push({
        id: "no-lockfile",
        category: "code",
        severity: "moderate",
        title: "No lockfile committed",
        detail:
          "Without a lockfile, every install can resolve to different dependency " +
          "versions, so your production build is not the one you tested — and a " +
          "freshly published malicious version can slip in without any change on " +
          "your side.",
        location: "package.json",
        fix:
          "Commit your package-lock.json (or pnpm-lock.yaml / yarn.lock). It " +
          "pins the exact versions everyone installs.",
      });
    }
  }

  // A committed .env is one of the most common and most costly leaks. We flag
  // the file's existence separately from the secret scanner, because the fix is
  // different: it is not just "rotate the key", it is "get this file out of git".
  const envFiles = files.filter((f) => {
    const name = f.path.split("/").pop() ?? "";
    return name.startsWith(".env") && name !== ".env.example" && name !== ".env.sample";
  });

  if (envFiles.length > 0) {
    const gitignore = files.find((f) => f.path === ".gitignore");
    const envIgnored = gitignore ? /(?:^|\n)\s*\.env/.test(gitignore.content) : false;

    if (!envIgnored) {
      findings.push({
        id: "env-not-ignored",
        category: "code",
        severity: "serious",
        title: `A .env file is present and not in .gitignore`,
        detail:
          "Environment files hold exactly the secrets that should never be " +
          "committed — database URLs, API keys, signing secrets. This one is not " +
          "excluded from git, so it is likely being tracked.",
        evidence: envFiles.map((f) => f.path).join("\n"),
        location: envFiles[0].path,
        count: envFiles.length,
        fix:
          "Add .env to .gitignore, then remove it from history with git rm " +
          "--cached .env. Rotate anything it contained — assume it was exposed.",
      });
    }
  }

  return findings;
}
