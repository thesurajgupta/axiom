# Demo video script — Axiom

**Target: 3:40.** Devpost allows 5:00. Shorter and tighter wins; judges watch
dozens of these back to back.

**Before recording:** run `npm run fixture` in one terminal and `npm run dev` in
another. Have the app open at the landing page. Light mode. Close other tabs.

---

## 0:00–0:20 — The problem, from their own life

> "You build something in an afternoon now. It works, you click around, it
> looks fine, you ship it.
>
> And you have no idea what's actually wrong with it."

---

## 0:20–0:50 — Set up the demo

Make sure **Whole site** is selected. Click **the broken demo app** chip.

> "This is a site I generated. Six pages. It looks completely normal.
>
> Watch what Axiom does — it's not reading the HTML. It crawls the site, opens
> every page in a real browser, and *uses* it."

Read the status lines as they stream — point at the page counter climbing:

> "Mapping the site… six pages found. Now it's auditing each one. And there —
> **'Now using your site with only a keyboard.'** That one matters."

---

## 0:50–1:20 — The verdict

Report appears. Point at the severity meter, then the line beneath it.

> "Thirty things. Four of them blocking.
>
> That bar is the whole report in one glance — red is 'someone can't use this
> right now.' You know how bad it is before you read a word.
>
> And underneath: six pages opened in a real browser, forty-five keyboard stops
> walked, twelve links requested. That's not a scan. That's someone using your
> site."

---

## 1:15–2:15 — The finding that sells it (slow down here)

Scroll to finding 01.

> "This is the one nobody else finds.
>
> **'Two controls cannot be reached by keyboard.'** One of them is the Sign up
> button.
>
> It was built as a `div` with a click handler. With a mouse it works perfectly.
> With a keyboard it does not exist. So anyone using a screen reader, anyone with
> a motor impairment, anyone whose trackpad just died — **cannot sign up for your
> product at all.** They're not a lost conversion, they're a locked door.
>
> And look at the evidence line: *we pressed Tab through the entire page and
> never landed on these.* We didn't infer that from your markup. We tried it."

Beat.

> "axe doesn't catch this. Lighthouse doesn't. No scanner does — because you
> can't find it by reading HTML. You have to actually use the site."

---

## 2:15–2:50 — Breadth, fast

Scroll through the rest at a steady clip. Don't narrate every one.

> "Your own API returning a 500 on page load. An uncaught exception killing
> everything after it. Your `.env` file — with the database URL and the Stripe
> key — publicly downloadable right now.
>
> Five internal links pointing at pages that don't exist. It requested every
> single one to find that.
>
> And the pricing page is 900 pixels wide on a 390 pixel phone — it re-rendered
> the whole site at phone size to catch that.
>
> Six different concerns that normally take six tools and a day."

---

## The optional second act — audit the code (adds ~40s)

If you have time for a longer cut, this is the strongest single moment. Click
**Audit your code** and drop in the vulnerable fixture zip.

> "The live audit uses your running site. But some bugs aren't visible from
> outside — a hardcoded API key, SQL you can inject, a login route with no rate
> limiting. For those, Axiom reads your source.
>
> And this is the part that matters: it runs locally. Your code is scanned in
> memory and thrown away — it never touches our disk, never goes to a model.
> Look — every secret it found is masked. `sk_live_` dot dot dot. It shows you
> where it is, never what it is."

Point at the blocker count.

> "Nineteen findings. The hardcoded Stripe key. SQL built by string concat. A
> payment amount trusted from the client — someone can change the price in dev
> tools. This is the class of bug every AI-generated app ships with, and it's
> exactly what you can't find by looking at the site from outside."

---

## 2:50–3:15 — The handoff (the second big idea)

Scroll back up to the blue box. Click **Copy prompt**.

> "And here's what you actually do about it.
>
> Every finding, in severity order, with the evidence and the fix — as one prompt
> for Claude Code. You don't work through 24 issues by hand. You paste this, and
> the agent fixes them from what we *observed*, not from what it guessed."

---

## 3:15–3:40 — Close on the dogfood

Switch to a terminal. Run `npm run scan -- http://localhost:3000`.

> "One last thing. We ran Axiom on Axiom.
>
> It found eight real problems in our own site — no CSP, no frame protection, no
> share preview, and an eleven-pixel label that its own mobile check flagged as
> too small to read. We fixed all eight.
>
> It also caught a bug in itself: we were bypassing CSP to inject the audit
> harness, which was hiding CSP-caused errors on the sites we scanned. So it now
> runs two passes — one under the site's real policy, one instrumented."

Let the output land: `0 findings`.

> "It passes its own audit. That felt like the minimum bar for shipping this."

---

## Recording checklist

- [ ] `npm run fixture` running on :4321 before you start
- [ ] Dry run once — the full site crawl takes ~36s, so know the timing and
      have something to say while the page counter climbs
- [ ] Light mode, notifications silenced, mic only
- [ ] Say **"we tried it"** and **"actually uses it"** — that's the one idea you
      want a judge to remember an hour later
- [ ] Don't read the README aloud. Show the product.

## What to leave out

- Team introductions, "our journey", tech-stack lists — no scoring value
- The architecture diagram; that's what the README is for
- Any apology for what's unfinished. The README states limitations honestly;
  the video shows what works.
