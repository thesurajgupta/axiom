import { parseColor, solveContrast, toHex, contrastRatio } from "../color";
import type { Patch, Violation, ViolationNode } from "../types";

/**
 * A fix generator turns one failing node into a candidate patch, or returns
 * null when it cannot fix the node honestly.
 *
 * Returning null is a first-class outcome. An accessibility tool that emits a
 * confident-looking wrong fix is worse than one that admits it needs a human:
 * a bogus `alt` attribute silences the audit while actively misleading the
 * screen-reader user it was meant to help. Overlay widgets fail exactly here,
 * which is why 113 sites using them were still sued in July 2026 alone.
 */
type FixGenerator = (node: ViolationNode, violation: Violation) => Patch | null;

/** Escape text for display inside an attribute in the rendered diff. */
function attr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/** Render a one-line "source" representation of the element after patching. */
function withAttribute(html: string, name: string, value: string): string {
  const openTag = html.match(/^<([a-z0-9-]+)([^>]*)>/i);
  if (!openTag) return html;
  const [full, tag, rest] = openTag;
  const existing = new RegExp(`\\s${name}="[^"]*"`, "i");
  const replacement = rest.match(existing)
    ? rest.replace(existing, ` ${name}="${attr(value)}"`)
    : `${rest} ${name}="${attr(value)}"`;
  return html.replace(full, `<${tag}${replacement}>`);
}

// --- colour-contrast ------------------------------------------------------

const fixContrast: FixGenerator = (node) => {
  const data = node.data as
    | {
        fgColor?: string;
        bgColor?: string;
        contrastRatio?: number;
        expectedContrastRatio?: string;
      }
    | undefined;

  if (!data?.fgColor || !data?.bgColor) return null;

  const fg = parseColor(data.fgColor);
  const bg = parseColor(data.bgColor);
  if (!fg || !bg) return null;

  // axe tells us the threshold it applied ("4.5:1" / "3:1"), which already
  // accounts for font size and weight. Trust it rather than re-deriving.
  const threshold = data.expectedContrastRatio
    ? parseFloat(data.expectedContrastRatio)
    : 4.5;

  // Aim slightly past the threshold rather than exactly at it. Solving for the
  // bare minimum leaves no margin, and any difference between our computation
  // and the auditor's — compositing of translucent backgrounds, rounding to two
  // decimals — lands the "fix" a hundredth below the line and it fails
  // verification. The verification loop caught this; the margin is the answer.
  const SAFETY_MARGIN = 0.1;
  const target = threshold + SAFETY_MARGIN;

  const solution = solveContrast(fg, bg, target);
  if (!solution) return null; // background itself is the problem — needs a human

  const before = contrastRatio(fg, bg);
  const hex = toHex(solution.color);

  return {
    ruleId: "color-contrast",
    target: node.target,
    ops: [{ kind: "setStyle", property: "color", value: hex }],
    deterministic: true,
    rationale:
      `Contrast was ${before.toFixed(2)}:1 against ${toHex(bg)}, below the ` +
      `${threshold}:1 required for WCAG 2.1 AA. Solved for the smallest lightness ` +
      `shift that clears the threshold while preserving hue and saturation ` +
      `(moved ${(solution.delta * 100).toFixed(1)}%).`,
    before: `color: ${toHex(fg)};`,
    after: `color: ${hex};`,
  };
};

// --- html-has-lang --------------------------------------------------------

const fixHtmlLang: FixGenerator = (node) => ({
  ruleId: "html-has-lang",
  target: node.target || "html",
  ops: [{ kind: "setAttribute", name: "lang", value: "en" }],
  deterministic: true,
  rationale:
    "The <html> element declared no language, so screen readers cannot select " +
    "a pronunciation model and fall back to the user's system locale — which " +
    'mispronounces the entire page. Defaulted to "en"; change if the page is ' +
    "authored in another language.",
  before: "<html>",
  after: '<html lang="en">',
});

// --- document-title -------------------------------------------------------

const fixDocumentTitle: FixGenerator = (node) => ({
  ruleId: "document-title",
  target: node.target || "html",
  ops: [{ kind: "setText", value: "__DERIVE_FROM_H1__" }],
  deterministic: true,
  rationale:
    "The document had no <title>. Screen-reader users rely on the title to " +
    "distinguish tabs and to know where they have landed. Derived from the " +
    "page's primary heading.",
  before: "<title></title>",
  after: "<title>(derived from <h1>)</title>",
});

// --- accessible names: buttons and links ---------------------------------

/**
 * Recover an accessible name from what is already in the markup: a title
 * attribute, a nested image's alt text, or the visible text content. We only
 * emit a patch when the page already contains the words — we never invent a
 * label, because an invented label is a guess about intent.
 */
function recoverName(html: string): { name: string; source: string } | null {
  const title = html.match(/\stitle="([^"]+)"/i);
  if (title?.[1]?.trim()) {
    return { name: title[1].trim(), source: "the element's title attribute" };
  }

  const imgAlt = html.match(/<img[^>]*\salt="([^"]+)"/i);
  if (imgAlt?.[1]?.trim()) {
    return { name: imgAlt[1].trim(), source: "the nested image's alt text" };
  }

  const value = html.match(/\svalue="([^"]+)"/i);
  if (value?.[1]?.trim()) {
    return { name: value[1].trim(), source: "the element's value attribute" };
  }

  // Visible text that is hidden from the a11y tree only by an aria-hidden icon.
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > 0 && text.length <= 80) {
    return { name: text, source: "the element's visible text" };
  }

  return null;
}

function nameFixer(ruleId: string, elementLabel: string): FixGenerator {
  return (node) => {
    const recovered = recoverName(node.html);
    if (!recovered) return null; // nothing truthful to use — escalate to a human

    return {
      ruleId,
      target: node.target,
      ops: [
        { kind: "setAttribute", name: "aria-label", value: recovered.name },
      ],
      deterministic: true,
      rationale:
        `This ${elementLabel} exposed no accessible name, so assistive tech ` +
        `announces it as an unlabelled control. Recovered the name from ` +
        `${recovered.source} — no new wording was invented.`,
      before: node.html.slice(0, 160),
      after: withAttribute(node.html, "aria-label", recovered.name).slice(0, 200),
    };
  };
}

// --- images ---------------------------------------------------------------

/**
 * Heuristics for images that carry no meaning. Spacers, tracking pixels and
 * decorative flourishes should be hidden from the a11y tree with alt="" —
 * that is the correct fix and it is fully determinable from the markup.
 * Content-bearing images need a human (or a vision model) and we say so.
 */
const DECORATIVE_HINTS =
  /(spacer|pixel|tracking|divider|separator|ornament|decoration|bg[-_]|background|gradient|shape|blob|dots?)/i;

const fixImageAlt: FixGenerator = (node) => {
  const src = node.html.match(/\ssrc="([^"]*)"/i)?.[1] ?? "";

  const dims = {
    w: parseInt(node.html.match(/\swidth="(\d+)"/i)?.[1] ?? "0", 10),
    h: parseInt(node.html.match(/\sheight="(\d+)"/i)?.[1] ?? "0", 10),
  };
  const isTracker = dims.w > 0 && dims.w <= 3 && dims.h > 0 && dims.h <= 3;
  const looksDecorative = DECORATIVE_HINTS.test(src) || isTracker;

  if (!looksDecorative) return null; // meaningful image → needs human review

  return {
    ruleId: "image-alt",
    target: node.target,
    ops: [
      { kind: "setAttribute", name: "alt", value: "" },
      { kind: "setAttribute", name: "role", value: "presentation" },
    ],
    deterministic: true,
    rationale: isTracker
      ? "A 1–3px image is a tracking pixel or spacer, never content. Marked " +
        "decorative so screen readers skip it instead of announcing its filename."
      : `The filename ("${src.split("/").pop()}") identifies this as a ` +
        "decorative asset. Marked decorative so it is skipped rather than " +
        "announced — an empty alt is the specified fix, not a missing one.",
    before: node.html.slice(0, 160),
    after: withAttribute(node.html, "alt", "").slice(0, 200),
  };
};

// --- registry -------------------------------------------------------------

const GENERATORS: Record<string, FixGenerator> = {
  "color-contrast": fixContrast,
  "color-contrast-enhanced": fixContrast,
  "html-has-lang": fixHtmlLang,
  "html-lang-valid": fixHtmlLang,
  "document-title": fixDocumentTitle,
  "button-name": nameFixer("button-name", "button"),
  "link-name": nameFixer("link-name", "link"),
  "input-button-name": nameFixer("input-button-name", "input button"),
  "image-alt": fixImageAlt,
  "input-image-alt": fixImageAlt,
};

export function generatePatch(
  violation: Violation,
  node: ViolationNode
): Patch | null {
  const generator = GENERATORS[violation.id];
  if (!generator) return null;
  try {
    return generator(node, violation);
  } catch {
    return null;
  }
}

export function supportedRules(): string[] {
  return Object.keys(GENERATORS);
}
