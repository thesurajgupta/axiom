/**
 * CLI runner for the full audit. `npm run scan -- https://yoursite.com`
 */
import { scan } from "../lib/scan";
import { SEVERITY_ORDER, CATEGORY_LABEL } from "../lib/findings";

const ICON: Record<string, string> = {
  blocker: "●",
  serious: "◐",
  moderate: "○",
  minor: "·",
};

async function main() {
  const url = process.argv[2] ?? "https://example.com";
  const depth = process.argv.includes("--page") ? "page" : "site";
  const maxPagesArg = process.argv.find((a) => a.startsWith("--max="));
  const maxPages = maxPagesArg ? Number(maxPagesArg.split("=")[1]) : 25;

  const result = await scan({
    url,
    depth,
    maxPages,
    onEvent: (event) => {
      if (event.type === "status") console.log("  ·", event.message);
      if (event.type === "page")
        console.log(`  → [${event.index}/${event.total}] ${event.url}`);
    },
  });

  console.log("\n" + "=".repeat(70));
  console.log(`  ${result.finalUrl}`);
  console.log(
    `  ${result.findings.length} findings · ${result.pagesAudited.length} pages · ` +
      `${result.linksChecked} links checked · ${result.tabStops} keyboard stops · ` +
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
    console.log(
      `    ${CATEGORY_LABEL[finding.category]}` +
        (finding.pages && finding.pages.length > 0
          ? `  ·  ${finding.pages.length} page(s)`
          : "")
    );
    if (finding.evidence) {
      const firstLine = finding.evidence.split("\n")[0];
      console.log(`    evidence: ${firstLine.slice(0, 110)}`);
    }
    console.log("");
  }

  console.log("=".repeat(70));
  console.log("  CLAUDE CODE PROMPT (first 900 chars)");
  console.log("=".repeat(70));
  console.log(result.agentPrompt.slice(0, 900));
  console.log("\n… " + result.agentPrompt.length + " chars total");

  if (result.cssFixes) {
    console.log("\n" + "=".repeat(70));
    console.log("  COPY-PASTE CSS");
    console.log("=".repeat(70));
    console.log(result.cssFixes.slice(0, 500));
  }

  void SEVERITY_ORDER;
}

main();
