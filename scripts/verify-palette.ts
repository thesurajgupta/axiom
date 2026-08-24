/**
 * Asserts every text/background pair in the design system clears WCAG AA,
 * using the same solver that powers the product. Run via `npm run verify:palette`.
 *
 * A tool that fails its own audit has no standing, so this runs alongside the
 * unit tests rather than being a one-off check.
 */
import { parseColor, contrastRatio } from "../lib/color";

type Pair = [name: string, fg: string, bg: string, minimum: number];

const LIGHT: Pair[] = [
  ["ink on paper", "#10151d", "#f2f4f7", 4.5],
  ["ink on card", "#10151d", "#ffffff", 4.5],
  ["ink-soft on paper", "#444f5f", "#f2f4f7", 4.5],
  ["ink-soft on card", "#444f5f", "#ffffff", 4.5],
  ["ink-faint on paper", "#5e6a7a", "#f2f4f7", 4.5],
  ["ink-faint on card", "#5e6a7a", "#ffffff", 4.5],
  ["blocking on card", "#b3231b", "#ffffff", 4.5],
  ["blocking on its wash", "#b3231b", "#fdeceb", 4.5],
  ["serious on card", "#9a4a06", "#ffffff", 4.5],
  ["serious on its wash", "#9a4a06", "#fdf0e3", 4.5],
  ["moderate on card", "#75600a", "#ffffff", 4.5],
  ["moderate on its wash", "#75600a", "#fbf4dc", 4.5],
  ["minor on card", "#4f5866", "#ffffff", 4.5],
  ["minor on its wash", "#4f5866", "#eceff3", 4.5],
  ["action ink on action", "#ffffff", "#1b4ed8", 4.5],
  ["action on paper", "#1b4ed8", "#f2f4f7", 4.5],
  ["clear on its wash", "#0d6b46", "#e0f5ec", 4.5],
];

const DARK: Pair[] = [
  ["ink on paper", "#e9edf3", "#0d1117", 4.5],
  ["ink on card", "#e9edf3", "#151b24", 4.5],
  ["ink-soft on paper", "#a3aebd", "#0d1117", 4.5],
  ["ink-soft on card", "#a3aebd", "#151b24", 4.5],
  ["ink-faint on paper", "#8a95a5", "#0d1117", 4.5],
  ["ink-faint on card", "#8a95a5", "#151b24", 4.5],
  ["blocking on card", "#ff7b6e", "#151b24", 4.5],
  ["blocking on its wash", "#ff7b6e", "#3a1a17", 4.5],
  ["serious on card", "#f0a259", "#151b24", 4.5],
  ["serious on its wash", "#f0a259", "#35240f", 4.5],
  ["moderate on card", "#d9c25f", "#151b24", 4.5],
  ["moderate on its wash", "#d9c25f", "#2e2810", 4.5],
  ["minor on card", "#9aa5b4", "#151b24", 4.5],
  ["minor on its wash", "#9aa5b4", "#1e242e", 4.5],
  ["action ink on action", "#0d1117", "#7fa8ff", 4.5],
  ["action on paper", "#7fa8ff", "#0d1117", 4.5],
  ["clear on its wash", "#5fd39d", "#102b20", 4.5],
];

let failures = 0;

for (const [theme, pairs] of [
  ["LIGHT", LIGHT],
  ["DARK", DARK],
] as const) {
  console.log(`\n${theme}`);
  for (const [name, fg, bg, minimum] of pairs) {
    const ratio = contrastRatio(parseColor(fg)!, parseColor(bg)!);
    const ok = ratio >= minimum;
    if (!ok) failures++;
    console.log(
      `  ${ok ? "PASS" : "FAIL"}  ${ratio.toFixed(2)}:1 (need ${minimum}) — ${name}`
    );
  }
}

if (failures > 0) {
  console.error(`\n${failures} palette pair(s) below WCAG AA.`);
  process.exit(1);
}
console.log("\nAll palette pairs clear WCAG AA.");
