import { chromium, type Browser } from "playwright-core";

/**
 * Launch a headless Chromium that works in whichever environment we are in.
 *
 * On a normal server or container (local dev, Render) Playwright's own bundled
 * Chromium is used. On a serverless platform (Vercel) there is no persistent
 * browser install and the filesystem is read-only, so we fall back to
 * @sparticuz/chromium — a build of Chromium packaged to run inside a Lambda-style
 * function. The two paths are otherwise identical to every caller.
 */
export async function launchBrowser(): Promise<Browser> {
  if (process.env.VERCEL) {
    // Loaded lazily so the (large) serverless Chromium is only pulled in on the
    // platform that needs it, never in local dev or the container build.
    const sparticuz = (await import("@sparticuz/chromium")).default;
    return chromium.launch({
      args: sparticuz.args,
      executablePath: await sparticuz.executablePath(),
      headless: true,
    });
  }

  return chromium.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}
