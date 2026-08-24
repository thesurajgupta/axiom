/**
 * WCAG 2.1 contrast mathematics.
 *
 * Colour-contrast failures are the single most common WCAG violation in the wild
 * (WebAIM Million 2026: present on ~79% of homepages). They are also completely
 * deterministic to fix: contrast is a closed-form function of two colours, so the
 * minimal correction can be *solved for* rather than guessed at by a model.
 *
 * Everything here is pure, synchronous and dependency-free, which is what lets the
 * fix engine run without network access or an API key.
 */

export interface RGB {
  r: number; // 0-255
  g: number;
  b: number;
}

/** Parse the colour formats axe-core actually reports: rgb(), rgba(), #hex. */
export function parseColor(input: string): RGB | null {
  const s = input.trim().toLowerCase();

  const rgbMatch = s.match(
    /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/
  );
  if (rgbMatch) {
    return {
      r: clamp255(parseFloat(rgbMatch[1])),
      g: clamp255(parseFloat(rgbMatch[2])),
      b: clamp255(parseFloat(rgbMatch[3])),
    };
  }

  const hex = s.replace(/^#/, "");
  if (/^[0-9a-f]{3}$/.test(hex)) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
    };
  }
  if (/^[0-9a-f]{6}$/.test(hex)) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  return null;
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function toHex({ r, g, b }: RGB): string {
  const h = (n: number) => clamp255(n).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Relative luminance, per WCAG 2.1 definition.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance({ r, g, b }: RGB): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, always >= 1. Returns e.g. 4.53 for a passing AA pair. */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * The AA threshold depends on text size: large text (>=18pt, or >=14pt bold)
 * only needs 3:1, everything else needs 4.5:1.
 */
export function requiredRatio(isLargeText: boolean, level: "AA" | "AAA" = "AA"): number {
  if (level === "AAA") return isLargeText ? 4.5 : 7;
  return isLargeText ? 3 : 4.5;
}

// --- HSL conversion, used to shift lightness while preserving hue ---------

interface HSL {
  h: number; // 0-360
  s: number; // 0-1
  l: number; // 0-1
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) return { h: 0, s: 0, l };

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case rn:
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
      break;
    case gn:
      h = ((bn - rn) / d + 2) * 60;
      break;
    default:
      h = ((rn - gn) / d + 4) * 60;
  }
  return { h, s, l };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  if (s === 0) {
    const v = clamp255(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  const hueToRgb = (t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const hn = h / 360;
  return {
    r: clamp255(hueToRgb(hn + 1 / 3) * 255),
    g: clamp255(hueToRgb(hn) * 255),
    b: clamp255(hueToRgb(hn - 1 / 3) * 255),
  };
}

export interface ContrastSolution {
  color: RGB;
  ratio: number;
  /** How far the lightness moved, 0-1. Lower is a more faithful fix. */
  delta: number;
}

/**
 * Find the *minimal* lightness shift to the foreground that reaches `target`
 * contrast against a fixed background, preserving hue and saturation.
 *
 * We binary-search lightness in the direction that increases contrast. Contrast
 * is monotonic in foreground lightness on each side of the background luminance,
 * so binary search converges cleanly. Preserving hue matters: designers reject
 * fixes that change their brand colour, and a rejected fix is not a fix.
 */
export function solveContrast(
  foreground: RGB,
  background: RGB,
  target: number
): ContrastSolution | null {
  const current = contrastRatio(foreground, background);
  if (current >= target) {
    return { color: foreground, ratio: current, delta: 0 };
  }

  const hsl = rgbToHsl(foreground);
  const bgLum = relativeLuminance(background);

  // Move away from the background: darken on light backgrounds, lighten on dark.
  const goDarker = bgLum > 0.5;
  const bound = goDarker ? 0 : 1;

  // Confirm the extreme actually satisfies the target; if pure black/white can't
  // reach it, the background itself is the problem and we refuse to guess.
  const extreme = hslToRgb({ ...hsl, l: bound });
  if (contrastRatio(extreme, background) < target) return null;

  // Invariant: `failing` is a lightness known to miss the target, `passing` is
  // known to meet it. We shrink the interval toward `failing` (the original
  // colour), so we converge on the smallest shift that still passes.
  let failing = hsl.l;
  let passing = bound;
  let best = extreme;

  for (let i = 0; i < 24; i++) {
    const mid = (failing + passing) / 2;
    const candidate = hslToRgb({ ...hsl, l: mid });
    if (contrastRatio(candidate, background) >= target) {
      best = candidate;
      passing = mid;
    } else {
      failing = mid;
    }
  }

  return {
    color: best,
    ratio: contrastRatio(best, background),
    delta: Math.abs(rgbToHsl(best).l - hsl.l),
  };
}
