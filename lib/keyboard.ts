import type { Page } from "playwright-core";

/**
 * Interaction-level accessibility testing.
 *
 * Static rule engines (axe, Lighthouse) read the DOM and check it against a
 * ruleset. That catches mechanical faults — a missing alt attribute, a failing
 * contrast ratio — but it structurally cannot catch the failures that actually
 * lock people out of a site:
 *
 *   - a button you can never reach because it is a <div> with a click handler
 *   - focus that enters a modal and cannot escape
 *   - a focus ring someone removed because it "looked ugly"
 *   - a tab order that jumps from the email field to the footer
 *
 * None of these are visible in the markup. You find them by actually operating
 * the page the way somebody with no mouse operates it — so that is what this
 * does. It presses Tab, over and over, and records where focus lands.
 */

export interface TabStop {
  /** Order in the tab sequence, starting at 1. */
  index: number;
  selector: string;
  tag: string;
  /** Accessible name, or visible text, for reporting. */
  label: string;
  /** Viewport position, used to judge whether the order is sane. */
  rect: { x: number; y: number; width: number; height: number };
  /** True when focusing the element visibly changes its appearance. */
  focusVisible: boolean;
  /** True when the element is scrolled/clipped out of sight while focused. */
  offscreen: boolean;
}

export interface InteractiveCandidate {
  selector: string;
  tag: string;
  label: string;
  /** Why we believe a user would expect this to be operable. */
  reason: string;
}

export interface KeyboardWalk {
  stops: TabStop[];
  /** Interactive-looking elements that never received focus. */
  unreachable: InteractiveCandidate[];
  /** True when Tab stopped advancing before the sequence completed. */
  trapped: boolean;
  trapAt?: TabStop;
  /** Total interactive elements we believe exist on the page. */
  interactiveCount: number;
}

/** Upper bound on Tab presses, so a huge page cannot hang a scan. */
const MAX_TAB_STOPS = 150;

/**
 * Build a stable-ish CSS selector for an element. We prefer id, then a
 * distinctive class, then nth-of-type within the parent. This is for *display*
 * — telling the developer where to look — so readability beats uniqueness.
 */
const SELECTOR_FN = `
window.axiomSelector = function axiomSelector(el) {
  if (!el || el === document.body) return "body";
  if (el.id) return "#" + CSS.escape(el.id);

  const cls = Array.from(el.classList || [])
    .filter((c) => !/^(css-|sc-|jsx-|_)/.test(c) && c.length < 30)
    .slice(0, 2);
  if (cls.length) return el.tagName.toLowerCase() + "." + cls.map((c) => CSS.escape(c)).join(".");

  const parent = el.parentElement;
  if (!parent) return el.tagName.toLowerCase();
  const sameTag = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
  const idx = sameTag.indexOf(el) + 1;
  return el.tagName.toLowerCase() + (sameTag.length > 1 ? ":nth-of-type(" + idx + ")" : "");
};
`;

/** Human-readable name for an element, for the findings list. */
const LABEL_FN = `
window.axiomLabel = function axiomLabel(el) {
  if (!el) return "";
  const aria = el.getAttribute && el.getAttribute("aria-label");
  if (aria) return aria.trim().slice(0, 60);
  const alt = el.querySelector && el.querySelector("img[alt]");
  if (alt) return alt.getAttribute("alt").trim().slice(0, 60);
  const text = (el.textContent || "").replace(/\\s+/g, " ").trim();
  if (text) return text.slice(0, 60);
  const title = el.getAttribute && el.getAttribute("title");
  if (title) return title.trim().slice(0, 60);
  const type = el.getAttribute && el.getAttribute("type");
  return type ? el.tagName.toLowerCase() + "[" + type + "]" : el.tagName.toLowerCase();
};
`;

/**
 * Snapshot the visual properties that a focus indicator could plausibly use.
 * Comparing this before and after focus is how we detect `outline: none` with
 * no replacement — the single most common keyboard-accessibility failure.
 */
const FOCUS_STYLE_FN = `
window.axiomFocusStyle = function axiomFocusStyle(el) {
  const s = getComputedStyle(el);
  return [
    s.outlineStyle, s.outlineWidth, s.outlineColor, s.outlineOffset,
    s.boxShadow, s.borderColor, s.borderWidth,
    s.backgroundColor, s.color, s.textDecorationLine, s.transform
  ].join("|");
};
`;

export async function installHelpers(page: Page): Promise<void> {
  // Indirect eval — (0, eval) — evaluates in global scope rather than the
  // calling function's scope, which is what puts these helpers on `window`
  // where every later page.evaluate() can see them. A direct eval() would
  // scope them to this callback and they would vanish on return.
  await page.evaluate((source) => {
    (0, eval)(source);
  }, [SELECTOR_FN, LABEL_FN, FOCUS_STYLE_FN].join("\n"));
}

/**
 * Walk the page with the Tab key and record every stop.
 *
 * The walk is genuinely driven through Playwright's keyboard rather than
 * simulated with `element.focus()`, because only real key events exercise the
 * browser's actual focus algorithm — including `tabindex`, focus traps, and
 * elements that intercept keydown.
 */
export async function walkTabOrder(page: Page): Promise<KeyboardWalk> {
  await installHelpers(page);

  // Start from a known position so the sequence is reproducible.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });

  const stops: TabStop[] = [];
  const seen = new Set<string>();
  let trapped = false;
  let trapAt: TabStop | undefined;
  let repeats = 0;

  for (let i = 0; i < MAX_TAB_STOPS; i++) {
    await page.keyboard.press("Tab");

    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body || el === document.documentElement) return null;

      const g = window as unknown as Record<string, (e: Element) => string>;
      const before = g.axiomFocusStyle(el);
      const rect = el.getBoundingClientRect();

      return {
        selector: g.axiomSelector(el),
        tag: el.tagName.toLowerCase(),
        label: g.axiomLabel(el),
        style: before,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y + window.scrollY),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        offscreen: rect.width === 0 || rect.height === 0,
      };
    });

    if (!stop) {
      // Focus left the document (browser chrome). The sequence is complete.
      break;
    }

    const key = stop.selector + "@" + stop.rect.x + "," + stop.rect.y;

    if (seen.has(key)) {
      repeats++;
      // Three repeats without new ground means we have looped the sequence.
      // That is normal at the end of a page; it is a trap only if we looped
      // after very few stops, which we judge below.
      if (repeats >= 3) break;
    } else {
      repeats = 0;
      seen.add(key);
    }

    // Measure whether focus is actually visible: compare the element's computed
    // style while focused against the same element blurred.
    const focusVisible = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;

      // Focus entering an iframe moves into its document, so the outer element's
      // own computed style legitimately does not change. Treating that as a
      // missing focus indicator is a false positive.
      if (el.tagName === "IFRAME" || el.tagName === "OBJECT") return true;
      const g = window as unknown as Record<string, (e: Element) => string>;
      const focused = g.axiomFocusStyle(el);
      el.blur();
      const blurred = g.axiomFocusStyle(el);
      el.focus();
      return focused !== blurred;
    });

    stops.push({
      index: stops.length + 1,
      selector: stop.selector,
      tag: stop.tag,
      label: stop.label,
      rect: stop.rect,
      focusVisible,
      offscreen: stop.offscreen,
    });
  }

  // A trap is focus that stops advancing while interactive elements remain
  // unvisited — for example a modal that keeps focus inside itself.
  const uniqueStops = new Set(stops.map((s) => s.selector)).size;
  if (stops.length >= 6 && uniqueStops <= 3) {
    trapped = true;
    trapAt = stops[stops.length - 1];
  }

  const { unreachable, interactiveCount } = await findUnreachable(page, stops);

  return { stops, unreachable, trapped, trapAt, interactiveCount };
}

/**
 * Find elements a sighted mouse user would expect to be operable, but which
 * never received keyboard focus.
 *
 * These are the hardest blockers we can report: not "this is awkward" but
 * "a keyboard user can never do this at all". The classic case is a `<div>`
 * with an onclick handler, which works perfectly with a mouse and is entirely
 * invisible to keyboard and screen-reader users.
 */
async function findUnreachable(
  page: Page,
  stops: TabStop[]
): Promise<{ unreachable: InteractiveCandidate[]; interactiveCount: number }> {
  const reached = new Set(stops.map((s) => s.selector));

  const result = await page.evaluate(() => {
    const g = window as unknown as Record<string, (e: Element) => string>;

    const NATIVE = "a[href], button, input, select, textarea, summary, [tabindex]";
    const candidates: Array<{
      selector: string;
      tag: string;
      label: string;
      reason: string;
    }> = [];

    const isVisible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const s = getComputedStyle(el);
      return s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
    };

    let interactiveCount = 0;

    // 1. Native controls that are visible but not focusable (disabled, or
    //    removed from the tab order with tabindex="-1").
    for (const el of Array.from(document.querySelectorAll(NATIVE))) {
      if (!isVisible(el)) continue;
      interactiveCount++;
      const tabindex = el.getAttribute("tabindex");
      if (tabindex === "-1" && !el.hasAttribute("aria-hidden")) {
        candidates.push({
          selector: g.axiomSelector(el),
          tag: el.tagName.toLowerCase(),
          label: g.axiomLabel(el),
          reason: 'has tabindex="-1", which removes it from the keyboard order',
        });
      }
    }

    // 2. Non-native elements that behave interactively. We cannot read React's
    //    synthetic handlers, so we infer from the signals that are observable:
    //    an explicit interactive ARIA role, or a pointer cursor on a element
    //    that is not a native control.
    const INTERACTIVE_ROLES = [
      "button", "link", "checkbox", "radio", "tab", "menuitem", "switch", "option",
    ];

    for (const el of Array.from(document.querySelectorAll("[role], div, span"))) {
      if (!isVisible(el)) continue;
      if (el.matches(NATIVE)) continue;
      if (el.closest("a[href], button")) continue; // operable via an ancestor

      // A label wrapping a real control is operable through that control, even
      // when the visible text is a styled span inheriting a pointer cursor.
      // This is the standard pattern for custom radios and checkboxes.
      const label = el.closest("label");
      if (label && label.querySelector(NATIVE)) continue;

      const role = el.getAttribute("role");
      const hasInteractiveRole = role ? INTERACTIVE_ROLES.includes(role) : false;
      const cursorPointer = getComputedStyle(el).cursor === "pointer";
      const hasInlineHandler = el.hasAttribute("onclick");

      // A pointer cursor alone is noisy (it is often set on a wrapper), so we
      // require the element to also be small and leaf-like to count it.
      const leafLike = el.children.length === 0 && (el.textContent || "").trim().length > 0;

      if (!hasInteractiveRole && !hasInlineHandler && !(cursorPointer && leafLike)) {
        continue;
      }

      interactiveCount++;
      const tabindex = el.getAttribute("tabindex");
      if (tabindex !== null && tabindex !== "-1") continue; // explicitly focusable

      candidates.push({
        selector: g.axiomSelector(el),
        tag: el.tagName.toLowerCase(),
        label: g.axiomLabel(el),
        reason: hasInteractiveRole
          ? `has role="${role}" but no tabindex, so the keyboard never reaches it`
          : hasInlineHandler
            ? "has a click handler but is not a button or link"
            : "is styled as clickable (pointer cursor) but is not a real control",
      });
    }

    return { candidates, interactiveCount };
  });

  const unreachable = result.candidates
    .filter((c) => !reached.has(c.selector))
    // Deduplicate: one report per distinct selector is enough to act on.
    .filter(
      (c, i, arr) => arr.findIndex((o) => o.selector === c.selector) === i
    )
    .slice(0, 25);

  return { unreachable, interactiveCount: result.interactiveCount };
}
