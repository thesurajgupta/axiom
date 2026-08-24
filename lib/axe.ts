import { source as axeSource } from "axe-core";
import type { Page } from "playwright-core";
import type { Violation } from "./types";

/**
 * Shape of the axe-core globals as they exist *inside the audited page*.
 *
 * These types describe the browser context, not ours: `page.evaluate` runs its
 * callback in the page, where `window.axe` was injected at runtime and has no
 * ambient declaration. Declaring the surface we actually use keeps the browser
 * boundary typed instead of scattering `any` through the call sites.
 */
interface AxeNodeResult {
  target: string[] | string;
  html: string;
  failureSummary?: string;
  any?: Array<{ data?: Record<string, unknown> }>;
  all?: Array<{ data?: Record<string, unknown> }>;
}

interface AxeViolation {
  id: string;
  impact: Violation["impact"];
  description: string;
  help: string;
  helpUrl: string;
  nodes: AxeNodeResult[];
}

interface AxeWindow extends Window {
  axe?: {
    run(
      context: unknown,
      options: unknown
    ): Promise<{ violations: AxeViolation[] }>;
  };
}

/**
 * axe-core ships its own bundled source as a string for exactly this purpose.
 * Using it avoids reading from node_modules at runtime, which breaks once a
 * bundler rewrites module paths (Turbopack, and any serverless build that
 * traces files rather than shipping node_modules).
 */
export async function injectAxe(page: Page): Promise<void> {
  const alreadyThere = await page.evaluate(
    () => typeof (window as AxeWindow).axe !== "undefined"
  );
  if (!alreadyThere) {
    await page.addScriptTag({ content: axeSource });
  }
}

/** WCAG 2.1 Level AA — the standard the DOJ named for ADA Title II. */
const AA_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

export interface RunAxeOptions {
  /** Restrict analysis to a subtree; used for scoped re-checks. */
  include?: string;
}

export async function runAxe(
  page: Page,
  options: RunAxeOptions = {}
): Promise<Violation[]> {
  await injectAxe(page);

  return page.evaluate(
    async ({ tags, include }) => {
      const axe = (window as AxeWindow).axe;
      if (!axe) throw new Error("axe-core failed to initialise in the page");

      const context = include ? { include: [[include]] } : document;
      const results = await axe.run(context, {
        runOnly: { type: "tag", values: tags },
        resultTypes: ["violations"],
      });

      return results.violations.map((v) => ({
        id: v.id,
        impact: v.impact ?? null,
        description: v.description,
        help: v.help,
        helpUrl: v.helpUrl,
        nodes: v.nodes.map((n) => ({
          target: Array.isArray(n.target) ? String(n.target[0]) : String(n.target),
          html: n.html,
          failureSummary: n.failureSummary ?? "",
          // Contrast checks carry the computed fg/bg colours we solve against.
          data: n.any?.[0]?.data ?? n.all?.[0]?.data ?? undefined,
        })),
      }));
    },
    { tags: AA_TAGS, include: options.include ?? null }
  );
}
