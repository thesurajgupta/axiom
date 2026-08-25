/**
 * Capture the README hero image: a real audit report, rendered by the real app.
 *
 * Deliberately screenshots an actual scan of the bundled broken fixture rather
 * than a mockup — the picture in the README should be something the reader can
 * reproduce with `npm run fixture && npm run dev`.
 */
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

const APP = process.env.APP_URL ?? "http://localhost:3000";

async function main() {
  await mkdir("docs", { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1320, height: 1400 },
    deviceScaleFactor: 2, // retina-crisp on GitHub
    colorScheme: "light",
  });

  await page.goto(APP, { waitUntil: "domcontentloaded" });

  // Click the bundled example chip rather than typing a URL: it starts the same
  // scan and avoids racing React's controlled-input state on a cold hydrate.
  await page.getByRole("button", { name: /broken demo app/i }).click();

  // The full crawl takes ~35s; wait for the verdict heading to appear.
  await page.waitForSelector("#verdict", { timeout: 180_000 });
  await page.waitForTimeout(1200);

  // Clip to the verdict card plus the agent handoff beneath it. The full report
  // is thousands of pixels tall; the part that communicates the product is the
  // severity meter and what you do next.
  const card = await page.locator("#verdict").locator("xpath=ancestor::section[1]").boundingBox();
  if (!card) throw new Error("could not locate the report card");

  await page.screenshot({
    path: "docs/report.png",
    clip: {
      x: Math.max(card.x - 18, 0),
      y: Math.max(card.y - 18, 0),
      width: card.width + 36,
      height: 660,
    },
  });
  console.log("wrote docs/report.png");

  await browser.close();
}

main();
