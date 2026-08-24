import type { Page } from "playwright-core";
import { runAxe } from "../axe";
import { generatePatch } from "../fixes";
import { walkTabOrder, type KeyboardWalk, type TabStop } from "../keyboard";
import type { Finding } from "../findings";
import type { Violation } from "../types";

/**
 * Accessibility findings, from two very different sources.
 *
 * The static pass (axe) reads the DOM and catches mechanical faults. The
 * interaction pass drives the keyboard and catches the faults that only appear
 * when you try to *use* the page — which are the ones that actually lock people
 * out. A missing alt attribute is a problem; a button you can never press is the
 * end of the road.
 */

/** Plain-English titles. axe's own wording is written for auditors, not builders. */
const RULE_COPY: Record<
  string,
  { title: string; detail: string; fix: string; severity: Finding["severity"] }
> = {
  "color-contrast": {
    title: "Text is too faint to read",
    detail:
      "The contrast between this text and its background is below the readable " +
      "threshold. People with low vision, and anyone using a phone in sunlight, " +
      "cannot reliably read it.",
    fix: "Darken the text or lighten the background until it clears 4.5:1.",
    severity: "serious",
  },
  "image-alt": {
    title: "Images have no description",
    detail:
      "A screen reader announces these images by reading out the filename, or " +
      "skips them entirely. If the image carries meaning, that meaning is lost.",
    fix:
      'Add alt text describing what the image shows. If it is purely decorative, ' +
      'use alt="" so it is skipped deliberately.',
    severity: "serious",
  },
  label: {
    title: "Form fields have no labels",
    detail:
      "A screen reader announces these inputs as just 'edit text' with no " +
      "indication of what to type. Placeholder text does not count — it " +
      "disappears the moment someone starts typing.",
    fix: "Associate a <label> with each input using htmlFor / id.",
    severity: "blocker",
  },
  "link-name": {
    title: "Links have no readable text",
    detail:
      "Screen-reader users often navigate by pulling up a list of every link on " +
      "the page. These ones appear in that list as 'link' with nothing else, so " +
      "there is no way to know where they go.",
    fix: "Give the link visible text, or an aria-label if it is icon-only.",
    severity: "serious",
  },
  "button-name": {
    title: "Buttons have no readable name",
    detail:
      "These announce as just 'button'. A user has no way to know what pressing " +
      "it will do.",
    fix: "Add text inside the button, or an aria-label for icon-only buttons.",
    severity: "serious",
  },
  "html-has-lang": {
    title: "The page does not declare its language",
    detail:
      "Screen readers use this to pick a pronunciation model. Without it, an " +
      "English page may be read with Spanish phonetics, which is unintelligible.",
    fix: 'Add lang to your <html> element.',
    severity: "moderate",
  },
  "frame-title": {
    title: "Embedded frames have no title",
    detail:
      "Screen readers announce iframes by their title. Without one the user is " +
      "told only that a frame exists, with no idea what is inside it.",
    fix: 'Add title="..." to each iframe describing its content.',
    severity: "moderate",
  },
};

function copyFor(rule: Violation) {
  return (
    RULE_COPY[rule.id] ?? {
      title: rule.help,
      detail: rule.description,
      fix: "See the linked WCAG reference for the required change.",
      severity: (rule.impact === "critical"
        ? "blocker"
        : rule.impact === "serious"
          ? "serious"
          : "moderate") as Finding["severity"],
    }
  );
}

export async function staticA11yFindings(page: Page): Promise<Finding[]> {
  const violations = await runAxe(page);

  return violations.map((violation) => {
    const copy = copyFor(violation);

    // Where a deterministic fix exists, show the exact value to change. This is
    // what turns "contrast is wrong" into something the developer can act on
    // without opening a colour picker.
    const patch = violation.nodes[0]
      ? generatePatch(violation, violation.nodes[0])
      : null;

    const selectors = [...new Set(violation.nodes.map((n) => n.target))].slice(0, 5);

    return {
      id: `a11y-${violation.id}`,
      category: "accessibility" as const,
      severity: copy.severity,
      title: copy.title,
      detail: copy.detail,
      evidence: violation.nodes[0]?.html?.slice(0, 200),
      location: selectors.join(", "),
      count: violation.nodes.length,
      fix: copy.fix,
      snippet:
        patch && violation.id === "color-contrast"
          ? {
              language: "css",
              code: `${selectors[0]} {\n  ${patch.after}\n}`,
            }
          : undefined,
      docsUrl: violation.helpUrl,
    };
  });
}

/**
 * Interaction findings. Nothing here is visible in the markup — every one of
 * these was discovered by pressing Tab and watching what happened.
 */
export async function keyboardFindings(page: Page): Promise<{
  findings: Finding[];
  walk: KeyboardWalk;
}> {
  const walk = await walkTabOrder(page);
  const findings: Finding[] = [];

  if (walk.unreachable.length > 0) {
    findings.push({
      id: "kbd-unreachable",
      category: "accessibility",
      severity: "blocker",
      title: `${walk.unreachable.length} control${walk.unreachable.length === 1 ? "" : "s"} cannot be reached by keyboard`,
      detail:
        "We pressed Tab through the entire page and never landed on these. " +
        "Anyone who cannot use a mouse — screen-reader users, people with motor " +
        "impairments, anyone whose trackpad just died — can never activate them. " +
        "If one of these is your sign-up or checkout button, those users cannot " +
        "convert at all.",
      evidence: walk.unreachable
        .slice(0, 6)
        .map((u) => `<${u.tag}> "${u.label}" — ${u.reason}`)
        .join("\n"),
      location: walk.unreachable.slice(0, 5).map((u) => u.selector).join(", "),
      count: walk.unreachable.length,
      fix:
        "Use a real <button> or <a href> instead of a div or span. If you " +
        "genuinely cannot, add tabindex=\"0\", role=\"button\" and a keydown " +
        "handler for Enter and Space.",
      snippet: {
        language: "jsx",
        code: '<div onClick={handleClick}>Sign up</div>\n\n// becomes\n\n<button onClick={handleClick}>Sign up</button>',
      },
    });
  }

  const invisible = walk.stops.filter((s) => !s.focusVisible);
  if (invisible.length > 0) {
    findings.push({
      id: "kbd-focus-invisible",
      category: "accessibility",
      severity: invisible.length > walk.stops.length / 2 ? "blocker" : "serious",
      title: `Focus is invisible on ${invisible.length} element${invisible.length === 1 ? "" : "s"}`,
      detail:
        "When these receive keyboard focus, nothing on screen changes. A " +
        "keyboard user has no way to tell where they are on the page — it is " +
        "like using the site with the cursor hidden. This is usually caused by " +
        "outline: none added to make the design look cleaner.",
      evidence: invisible
        .slice(0, 6)
        .map((s) => `tab stop ${s.index}: <${s.tag}> "${s.label}"`)
        .join("\n"),
      location: [...new Set(invisible.map((s) => s.selector))].slice(0, 5).join(", "),
      count: invisible.length,
      fix:
        "Never remove an outline without replacing it. Use :focus-visible so the " +
        "ring appears for keyboard users without showing on mouse clicks.",
      snippet: {
        language: "css",
        code: ":focus-visible {\n  outline: 2px solid #4f8cff;\n  outline-offset: 2px;\n}",
      },
    });
  }

  if (walk.trapped && walk.trapAt) {
    findings.push({
      id: "kbd-trap",
      category: "accessibility",
      severity: "blocker",
      title: "Keyboard focus gets stuck",
      detail:
        "Focus entered a region and could not get out by pressing Tab. For a " +
        "keyboard-only user this is a dead end — the only way out is to close " +
        "the tab and lose whatever they were doing.",
      evidence: `Focus stopped advancing at <${walk.trapAt.tag}> "${walk.trapAt.label}"`,
      location: walk.trapAt.selector,
      fix:
        "If this is a modal, implement a proper focus trap that releases on " +
        "Escape and returns focus to whatever opened it. If it is not a modal, " +
        "something is calling preventDefault on the Tab key.",
    });
  }

  const jumps = findOrderJumps(walk.stops);
  if (jumps.length > 0) {
    findings.push({
      id: "kbd-order",
      category: "accessibility",
      severity: "moderate",
      title: "Tab order jumps around the page",
      detail:
        "The keyboard order does not follow the visual order. Someone tabbing " +
        "through moves from one part of the page to a distant one and back " +
        "again, which makes forms especially confusing to complete.",
      evidence: jumps
        .slice(0, 4)
        .map(
          (j) =>
            `stop ${j.from.index} ("${j.from.label}") → stop ${j.to.index} ("${j.to.label}") jumps ${j.distance}px back up the page`
        )
        .join("\n"),
      count: jumps.length,
      fix:
        "Match DOM order to visual order. This is usually caused by positive " +
        "tabindex values, or by CSS (order, flex-direction: row-reverse, grid " +
        "placement) moving elements visually without moving them in the DOM.",
    });
  }

  return { findings, walk };
}

/**
 * A "jump" is focus moving substantially back up the page after having moved
 * down. Small backward movements are normal within a row of controls, so we
 * require a large vertical regression before calling it out.
 */
function findOrderJumps(
  stops: TabStop[]
): Array<{ from: TabStop; to: TabStop; distance: number }> {
  const jumps: Array<{ from: TabStop; to: TabStop; distance: number }> = [];
  let highWaterMark = 0;

  for (let i = 1; i < stops.length; i++) {
    const previous = stops[i - 1];
    const current = stops[i];
    highWaterMark = Math.max(highWaterMark, previous.rect.y);

    const regression = highWaterMark - current.rect.y;
    if (regression > 400) {
      jumps.push({ from: previous, to: current, distance: Math.round(regression) });
      highWaterMark = current.rect.y; // avoid reporting the same jump repeatedly
    }
  }

  return jumps;
}
