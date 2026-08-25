/**
 * Assert the published check catalog matches the engine.
 *
 * The /checks page is a claim about what this tool does. This test keeps that
 * claim honest in both directions: every catalog entry must correspond to a
 * finding id that exists in the source, and the axe rule count must match the
 * installed axe-core. Run via `npm run verify:catalog`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import { AXE_WCAG_RULE_COUNT, CATALOG, OWN_CHECK_COUNT } from "../lib/catalog";

function sourceIds(): Set<string> {
  const ids = new Set<string>();
  for (const dir of ["lib/checks", "lib/code"]) {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".ts")) continue;
      const src = readFileSync(join(dir, file), "utf8");

      // Ids appear either as a literal `id: "x"` or built from a rule id with a
      // prefix (`id: \`secret-${rule.id}\``), so collect both shapes.
      for (const m of src.matchAll(/id:\s*"([a-z0-9-]+)"/g)) ids.add(m[1]);
      for (const m of src.matchAll(/^\s*id:\s*"([a-z0-9-]+)",/gm)) ids.add(m[1]);
    }
  }

  // Prefixed emitters: secrets.ts emits `secret-${rule.id}`, patterns.ts emits
  // `pattern-${rule.id}`. Add those permutations so the catalog can use the
  // real emitted id rather than the bare rule id.
  const prefixed = new Set<string>();
  for (const id of ids) {
    prefixed.add(`secret-${id}`);
    prefixed.add(`pattern-${id}`);
    prefixed.add(`header-${id}`);
  }
  for (const id of prefixed) ids.add(id);

  // Header rules are keyed by header name in a `header:` field.
  const sec = readFileSync("lib/checks/security.ts", "utf8");
  for (const m of sec.matchAll(/header:\s*"([a-z0-9-]+)"/g)) {
    ids.add(`header-${m[1]}`);
  }
  return ids;
}

const known = sourceIds();
const missing: string[] = [];

for (const group of CATALOG) {
  for (const entry of group.entries) {
    if (!known.has(entry.id)) missing.push(`${group.key} → ${entry.id}`);
  }
}

let failed = false;

if (missing.length > 0) {
  failed = true;
  console.error(
    `\n${missing.length} catalog entr${missing.length === 1 ? "y has" : "ies have"} no matching finding id in the engine:`
  );
  for (const m of missing) console.error("  ✗ " + m);
} else {
  console.log(`✓ all ${OWN_CHECK_COUNT} catalog entries map to real finding ids`);
}

const wcagRules = axe
  .getRules()
  .filter((r) =>
    (r.tags ?? []).some((t: string) => /^wcag(2a|2aa|21a|21aa)$/.test(t))
  ).length;

if (wcagRules !== AXE_WCAG_RULE_COUNT) {
  failed = true;
  console.error(
    `\n✗ axe WCAG rule count drifted: catalog says ${AXE_WCAG_RULE_COUNT}, installed axe-core has ${wcagRules}`
  );
} else {
  console.log(`✓ axe-core WCAG 2.1 A/AA rule count matches (${wcagRules})`);
}

if (failed) process.exit(1);
console.log(`\nCatalog verified: ${OWN_CHECK_COUNT} own checks + ${wcagRules} axe rules.`);
