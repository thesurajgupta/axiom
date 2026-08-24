import { parseColor, contrastRatio, solveContrast, toHex } from "../lib/color";

const checks: [string, number, number][] = [];
const r = (a: string, b: string) => contrastRatio(parseColor(a)!, parseColor(b)!);

// Known WCAG reference values
checks.push(["black on white", r("#000000", "#ffffff"), 21]);
checks.push(["white on white", r("#ffffff", "#ffffff"), 1]);
checks.push(["#777 on white (known fail 4.48)", r("#777777", "#ffffff"), 4.48]);
checks.push(["#767676 on white (known pass 4.54)", r("#767676", "#ffffff"), 4.54]);
checks.push(["rgba parse", r("rgba(0, 0, 0, 0.9)", "rgb(255,255,255)"), 21]);

let ok = true;
for (const [name, got, want] of checks) {
  const pass = Math.abs(got - want) < 0.02;
  if (!pass) ok = false;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}: got ${got.toFixed(2)} want ${want}`);
}

console.log("\n-- solver: minimal shift to AA 4.5:1 --");
for (const [fg, bg] of [["#777777","#ffffff"], ["#999999","#ffffff"], ["#0000ff","#000000"], ["#e0e0e0","#ffffff"]]) {
  const sol = solveContrast(parseColor(fg)!, parseColor(bg)!, 4.5);
  if (!sol) { console.log(`  ${fg} on ${bg} -> UNSOLVABLE (correctly refused)`); continue; }
  const verified = contrastRatio(sol.color, parseColor(bg)!);
  const good = verified >= 4.5;
  if (!good) ok = false;
  console.log(`  ${good?"PASS":"FAIL"} ${fg} on ${bg} -> ${toHex(sol.color)}  ratio ${verified.toFixed(2)}  lightness moved ${(sol.delta*100).toFixed(1)}%`);
}
console.log(ok ? "\nALL GREEN" : "\nFAILURES PRESENT");
