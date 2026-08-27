# Demo video — shot-by-shot script

**Target: 3:00.** Two columns: what's on screen, and what you say over it.
Read the delivery notes at the bottom before you record.

---

## Before you hit record

```bash
npm run fixture     # terminal 1 — the broken demo site on :4321
npm run dev         # terminal 2 — Axiom on :3000
```

- Browser at `http://localhost:3000`, **light mode**, one tab only
- A second tab already open at `http://localhost:4321` (the broken site)
- Have `vulnerable-project.zip` on your Desktop, ready to drag
- Notifications off. Dock hidden. Zoom the browser to ~110% so text reads on a phone.
- **Do one full dry run.** The site crawl takes ~35 seconds — you need to know
  what you're saying while it runs.

---

## 0:00 – 0:25 · The hook

Do **not** introduce yourself. Do not say "Hi guys." Start mid-thought.

| Show | Say |
| --- | --- |
| The broken site at `:4321`. Just sitting there, looking completely normal. | "This is a landing page. Looks fine." |
| Move your cursor to the **Sign up free** button. Don't click. Just hover. | "There's the sign-up button." |
| Take your hand off the mouse — visibly. Then press **Tab**. Slowly. Four times. Let each one land. | "Now watch. I'm going to sign up using only my keyboard. No mouse." |
| Focus goes: email → name → *skips the button* → the settings link. Pause on the last one. | *(Tab… Tab… Tab… Tab…)* "…and that's the whole page. It never landed on the button." |
| Hold on the page. Silence for a beat. | "I can't sign up. There's no way to do it." |
| Slowly scroll to the button one more time. | "It's not broken. With a mouse it works perfectly. But if you can't use a mouse — a screen reader, a motor impairment, a trackpad that just died — you can never sign up for this product." |
| Beat. | "And I wrote this page. I had no idea." |

---

## 0:25 – 0:40 · Turn

| Show | Say |
| --- | --- |
| Switch to the Axiom tab. Landing page, clean. | "So I built Axiom." |
| Scroll slowly past the three red stats — 95.9%, 5,000+, 113. Don't stop on them. | "Ninety-six percent of the top million sites have problems like this. Five thousand lawsuits last year. And a hundred and thirteen of the sites sued in a single month were already paying for an accessibility widget — because those widgets patch the page, they don't fix the code." |
| Land on the URL input. | "Axiom actually fixes it. Watch." |

---

## 0:40 – 1:20 · The audit runs

| Show | Say |
| --- | --- |
| Click **the broken demo app** chip. Scan starts. | "It's not reading my HTML. It opens my site in a real browser." |
| Status lines stream. Point at "Mapping your site… 6 pages found". | "It's crawling every page…" |
| Point at the page-progress bar climbing. | "…opening each one…" |
| **Wait for this line and read it out loud:** "Now using your site with only a keyboard." | "…and *there*. It's using my site with only a keyboard. Same thing I just did — but on every page." |
| Report appears. Let it land. Don't talk over the reveal. | *(pause, 1 second)* |
| Point at the severity bar. | "Thirty things. Four of them blocking." |
| Point at the stats line underneath. | "Six pages, forty-five keyboard stops, twelve links requested. Thirty-five seconds." |

---

## 1:20 – 1:50 · The finding that matters

| Show | Say |
| --- | --- |
| Scroll to finding **01**. Slow down here. | "And here it is." |
| Read the title on screen. | "'Two controls cannot be reached by keyboard.'" |
| Point at the evidence block. | "It found the exact button I couldn't reach. It's a `div` with a click handler — not a real button." |
| Point at the "Where" line showing two pages. | "And it's on two pages, not one." |
| Beat. Look at camera if you're on cam. | "No scanner finds this. You can't find it by reading HTML — you have to actually try to use the site." |
| Scroll to the faint-text finding with **689×**. | "Same run — six hundred and eighty-nine elements failing contrast. But they're all the same grey from the same stylesheet." |
| Point at the count. | "So it's one finding, not six hundred. One line to change." |

---

## 1:50 – 2:20 · The code audit

| Show | Say |
| --- | --- |
| Click **Audit your code** tab. | "The other half is different. Some bugs a browser can never see." |
| Drag `vulnerable-project.zip` onto the drop zone. | "So I give it my source." |
| **Point at the privacy line while it scans.** | "This runs in memory and gets thrown away. My code never hits their disk, never goes to a model." |
| Report appears — 19 findings, 9 blocking. | "Nineteen problems. Nine blocking." |
| Scroll to the Stripe key finding. Zoom in on the masked value. | "A live Stripe key, hardcoded. And look —" |
| Point directly at `sk_••••••••TUV`. | "— it's masked. It tells me the file and the line. It never shows me the key. I could screen-share this right now." |
| Scroll fast past the rest. | "SQL injection. A JWT it never verifies. A payment amount taken straight from the client — someone opens dev tools, changes the price. A login route with no rate limiting." |
| Beat. | "That's every mistake an AI writes when you tell it to 'just make it work'." |

---

## 2:20 – 2:40 · The handoff

| Show | Say |
| --- | --- |
| Scroll up to the blue **Fix all with Claude Code** box. | "And then the part I actually use." |
| Click **Copy prompt**. Button flips to "Copied". | "Every finding, in severity order, with the evidence." |
| Open the prompt preview so they see the length scroll by. | "I paste this into Claude Code and it fixes them — from what Axiom *observed*, not from what it guessed." |

---

## 2:40 – 3:00 · Close on the dogfood

| Show | Say |
| --- | --- |
| Switch to a terminal. Type it live: `npm run scan -- http://localhost:3000` | "Last thing. I ran Axiom on Axiom." |
| While it runs. | "It found eight real problems in my own site. No security policy. No frame protection. An eleven-pixel label its own mobile check flagged as too small to read." |
| Result lands: `0 blocker · 0 serious · 0 moderate · 0 minor` | "Fixed all eight." |
| Hold on the zeros. | "It passes its own audit." |
| Beat. Then: | "It even caught a bug in itself — I was bypassing security policies to inject the auditor, which was hiding the errors those policies cause. That's why it runs two passes now." |
| Final frame: the Axiom landing page, or the severity bar. | "Axiom. Find what's broken before you ship it." |

---

## Delivery notes

**The three sentences that have to land.** Slow down for these:
1. *"And I wrote this page. I had no idea."*
2. *"You have to actually try to use the site."*
3. *"It passes its own audit."*

**Pacing.** Fast through the breadth (2:00–2:20). Slow through the hook (0:00–0:25)
and the keyboard finding (1:20–1:50). The contrast is what keeps people watching.

**Don't say:** "as you can see", "basically", "so yeah", "um let me just", "this is
a project I built for the hackathon". Never explain that you're about to show
something — just show it.

**Do use silence.** Two full seconds after the report appears. Two after "I had no
idea." Silence reads as confidence; filler reads as nerves.

**If you fumble a line, keep going.** One natural stumble makes it sound human.
Restarting five times makes it sound scripted.

**Record audio separately if you can.** Screen first, voice over it. You'll speak
more calmly when you're not also driving the mouse.

**Length.** If you run long, cut the breadth section (2:00–2:20) — not the hook.
