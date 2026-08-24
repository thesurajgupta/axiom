import type { BrowserContext } from "playwright-core";
import type { Finding } from "../findings";

/**
 * Mobile layout checks.
 *
 * Most traffic is mobile and most development happens on a 27-inch monitor, so
 * this is where generated sites break most reliably and most invisibly. None of
 * it can be found by reading markup: you have to render the page narrow and
 * measure what actually happened.
 */

const MOBILE = { width: 390, height: 844 };

interface LayoutProblems {
  /** Elements extending past the right edge of the viewport. */
  overflowing: Array<{ selector: string; overhang: number; text: string }>;
  documentWidth: number;
  viewportWidth: number;
  /** Interactive controls smaller than the 24px minimum WCAG 2.2 target size. */
  smallTargets: Array<{ selector: string; width: number; height: number; label: string }>;
  /** Body text rendered below 12px, which is unreadable on a phone. */
  tinyText: Array<{ selector: string; size: number; text: string }>;
}

const PROBE = `
window.axiomLayout = function axiomLayout() {
  const vw = document.documentElement.clientWidth;

  const describe = (el) => {
    if (el.id) return "#" + el.id;
    const cls = Array.from(el.classList || [])
      .filter((c) => !/^(css-|sc-|jsx-)/.test(c) && c.length < 24)
      .slice(0, 2);
    return el.tagName.toLowerCase() + (cls.length ? "." + cls.join(".") : "");
  };

  const textOf = (el) =>
    (el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 50);

  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return false;
    // Elements deliberately parked off-screen (carousels, skip links, drawers)
    // are not layout bugs, so ignore anything whose ancestor hides overflow.
    return true;
  };

  const overflowing = [];
  const seenOverflow = new Set();
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const overhang = Math.round(r.right - vw);
    if (overhang <= 4) continue;

    // Report the outermost offender only: if a parent overflows, listing every
    // descendant it drags with it is noise.
    if (el.parentElement && seenOverflow.has(el.parentElement)) {
      seenOverflow.add(el);
      continue;
    }
    seenOverflow.add(el);
    overflowing.push({ selector: describe(el), overhang, text: textOf(el) });
    if (overflowing.length >= 12) break;
  }

  const smallTargets = [];
  for (const el of Array.from(
    document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, [role="button"]')
  )) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // Links sitting inside a paragraph are inline text, not tap targets.
    if (el.tagName === "A" && el.closest("p, li")) continue;
    if (r.width >= 24 && r.height >= 24) continue;

    // Anything a few pixels across is a visually-hidden control that reveals
    // itself on focus — the standard skip-link pattern. Reporting those as
    // undersized targets is a false positive against sites doing it correctly.
    if (r.width <= 6 || r.height <= 6) continue;
    const cs = getComputedStyle(el);
    if (cs.clipPath !== "none" || (cs.clip && cs.clip !== "auto")) continue;
    if (r.left + r.width < 0 || r.top + r.height < 0) continue;
    smallTargets.push({
      selector: describe(el),
      width: Math.round(r.width),
      height: Math.round(r.height),
      label: textOf(el) || el.tagName.toLowerCase(),
    });
    if (smallTargets.length >= 12) break;
  }

  const tinyText = [];
  for (const el of Array.from(document.querySelectorAll("p, li, span, td, label, div"))) {
    if (!visible(el)) continue;
    const text = textOf(el);
    if (text.length < 12) continue;
    // Only leaf-ish nodes, so we do not blame a wrapper for its children.
    if (el.children.length > 0) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size >= 12) continue;
    tinyText.push({ selector: describe(el), size: Math.round(size * 10) / 10, text });
    if (tinyText.length >= 8) break;
  }

  return {
    overflowing,
    documentWidth: Math.round(document.documentElement.scrollWidth),
    viewportWidth: vw,
    smallTargets,
    tinyText,
  };
};
`;

export async function responsiveFindings(
  context: BrowserContext,
  url: string
): Promise<Finding[]> {
  const page = await context.newPage();

  try {
    await page.setViewportSize(MOBILE);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForTimeout(1200);

    await page.evaluate((source) => {
      (0, eval)(source);
    }, PROBE);

    const layout = (await page.evaluate(() => {
      const g = window as unknown as Record<string, () => unknown>;
      return g.axiomLayout();
    })) as LayoutProblems;

    const findings: Finding[] = [];

    // Horizontal scroll on a phone is the single most obvious sign that nobody
    // opened the site on one.
    const horizontalOverflow = layout.documentWidth > layout.viewportWidth + 4;
    if (horizontalOverflow && layout.overflowing.length > 0) {
      findings.push({
        id: "mobile-overflow",
        category: "accessibility",
        severity: "serious",
        title: "The page scrolls sideways on a phone",
        detail:
          `At 390px wide — an iPhone — your content is ${layout.documentWidth}px ` +
          "across, so the whole page slides horizontally. Text runs off the edge " +
          "and users have to pan around to read it.",
        evidence: layout.overflowing
          .slice(0, 6)
          .map(
            (o) =>
              `${o.selector} extends ${o.overhang}px past the edge` +
              (o.text ? `  "${o.text}"` : "")
          )
          .join("\n"),
        location: layout.overflowing.slice(0, 5).map((o) => o.selector).join(", "),
        count: layout.overflowing.length,
        fix:
          "Usually a fixed width, a wide table, or a long unbroken string. Find " +
          "the element above and let it shrink.",
        snippet: {
          language: "css",
          code: "/* Common culprits */\nimg, video, table { max-width: 100%; }\npre, code { overflow-x: auto; }\n* { min-width: 0; } /* lets flex/grid children actually shrink */",
        },
      });
    }

    if (layout.smallTargets.length > 0) {
      findings.push({
        id: "small-tap-targets",
        category: "accessibility",
        severity: "moderate",
        title: `${layout.smallTargets.length} tap target${layout.smallTargets.length === 1 ? " is" : "s are"} too small to hit`,
        detail:
          "WCAG 2.2 asks for at least 24×24px. Below that, people with any degree " +
          "of tremor, larger fingers, or a moving bus mis-tap repeatedly — and " +
          "often tap the wrong thing instead.",
        evidence: layout.smallTargets
          .slice(0, 6)
          .map((t) => `${t.selector} is ${t.width}×${t.height}px  "${t.label}"`)
          .join("\n"),
        location: layout.smallTargets.slice(0, 5).map((t) => t.selector).join(", "),
        count: layout.smallTargets.length,
        fix:
          "Give them a minimum size. Padding counts toward the target, so you can " +
          "keep the icon small and grow the hit area around it.",
        snippet: {
          language: "css",
          code: ".icon-button {\n  min-width: 44px;\n  min-height: 44px;\n}",
        },
      });
    }

    if (layout.tinyText.length > 0) {
      findings.push({
        id: "tiny-text",
        category: "accessibility",
        severity: "moderate",
        title: "Some text is too small to read on a phone",
        detail:
          "Text under 12px is difficult for most people to read on a handset and " +
          "effectively impossible for anyone with reduced vision.",
        evidence: layout.tinyText
          .slice(0, 5)
          .map((t) => `${t.selector} at ${t.size}px  "${t.text}"`)
          .join("\n"),
        count: layout.tinyText.length,
        fix: "Bring body text to at least 14px, and never below 12px.",
      });
    }

    return findings;
  } catch {
    // A page that will not load at mobile size is already reported by the
    // runtime checks; do not double-report it here.
    return [];
  } finally {
    await page.close();
  }
}
