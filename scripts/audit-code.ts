/**
 * Local code-security audit. Runs entirely on your machine — your source is
 * never uploaded, stored, or sent to a model.
 *
 *   npm run audit -- ./path/to/your/project
 */
import { resolve } from "node:path";
import { scanCode } from "../lib/code/scan";
import { CATEGORY_LABEL } from "../lib/findings";

const ICON: Record<string, string> = {
  blocker: "●",
  serious: "◐",
  moderate: "○",
  minor: "·",
};

async function main() {
  const target = resolve(process.argv[2] ?? ".");

  console.log(`\n  Auditing ${target}`);
  console.log("  Everything runs locally. Nothing leaves this machine.\n");

  const result = await scanCode(target, (event) => {
    if (event.type === "status") console.log("  ·", event.message);
  });

  console.log("\n" + "=".repeat(70));
  console.log(
    `  ${result.findings.length} findings · ${result.filesScanned} files scanned · ` +
      `${(result.durationMs / 1000).toFixed(1)}s`
  );
  console.log("=".repeat(70));

  const { blocker, serious, moderate, minor } = result.counts;
  console.log(
    `\n  ${blocker} blocker   ${serious} serious   ${moderate} moderate   ${minor} minor\n`
  );

  for (const finding of result.findings) {
    console.log(
      `${ICON[finding.severity]} [${finding.severity.toUpperCase()}] ${finding.title}` +
        (finding.count && finding.count > 1 ? `  (${finding.count}×)` : "")
    );
    console.log(`    ${CATEGORY_LABEL[finding.category]}`);
    if (finding.evidence) {
      console.log(`    ${finding.evidence.split("\n")[0].slice(0, 120)}`);
    }
    console.log("");
  }

  if (result.findings.length > 0) {
    console.log("=".repeat(70));
    console.log("  Paste result.agentPrompt into Claude Code to fix these.");
    console.log("=".repeat(70));
  }
}

main();
