# Soft-red R6b: Marquee, word reveal, product card hover — Plan (Bob's review applied; Charlie chose D1 A, D2 A, D3 a on 2026-10-24 and approved the two pause-button names; building)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax. Tests first; show each test failing on the old code.

**Goal:** Finish the storefront motion: the home marquee moves, the home "promise" statement fills in word by word as you scroll, and product cards react to hover. No change to copy, links, data or logic.

**Architecture:** CSS-only marquee (keyframes in `tailwind.config.ts`, like `toast-in`). One small client component `WordReveal` (scroll position → per-word opacity, one passive scroll listener with `requestAnimationFrame`). Card hover is classes on `ProductCard` only. No new library.

**Spec:** `docs/superpowers/plans/2026-10-16-soft-red-storefront-redesign.md` (R6), measured values in `2026-10-24-soft-red-r6-motion.md` (R6a plan, table at top). R6a shipped as PR #186 (`Reveal`, tokens `duration-reveal`, `ease-out-expo`).

## What is in and out

| Item               | Decision                                                                              | Why                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Marquee moves      | **In**                                                                                | `_home/marquee.tsx` exists and says "it never moves (motion is R6)".                                                    |
| Word reveal        | **In**, on the home promise statement (`data-promise-statement`, `_home/promise.tsx`) | It is the one long statement on the page.                                                                               |
| Product card hover | **In**, `ProductCard`                                                                 | Shared by home, products, brands.                                                                                       |
| Rotating badge     | **Out**                                                                               | The BOMY home has no badge. We do not invent content for a motion. Recorded; a later slice if a real badge is designed. |
| Counters           | **Out**                                                                               | Not on the reference page; `Stats` shows real counts and stays still.                                                   |

## Measured on the reference (R6a table) vs chosen by us

| Value                                                                               | Source                         |
| ----------------------------------------------------------------------------------- | ------------------------------ |
| Marquee speed ~2.2 % of width per second (about 32 px/s at 1440 px)                 | measured                       |
| Word start opacity 0.18, rises to 1 with scroll                                     | measured                       |
| Card image ease-out-expo, 0.7 s                                                     | measured                       |
| Card hover on the reference = lift 12 px + turn 3° of a **cut-out** product picture | measured, but see D2           |
| Marquee loop point; word-reveal scroll range; card scale amount                     | **not measured; chosen below** |

## Global Constraints

- `prefers-reduced-motion: reduce`: marquee is still (one copy, as today), words all at full opacity, no card movement. Each has a test.
- Only `transform` and `opacity`. No layout shift. No sideways page scroll at 320/390/767/1440 px.
- Server HTML stays complete and visible: the statement text is in the HTML as normal text; the marquee copies are decoration (`aria-hidden`) and add no readable text.
- Real data only: marquee words and category names come from the same props as today.
- `@bomy/ui` and admin untouched. No copy, link, `aria-` change.
- Gates: Prettier, lint `--max-warnings 0`, `pnpm ui:audit --allow-deferred` exit 0, `ui:audit:test` 17/17, typecheck, build, full web suite with DB env (run `node scripts/check-integration-env.mjs` first).
- Branch `feat/soft-red-r6b` from `main` (done). Repo stays PRIVATE until Charlie says "go push".
- Words and copy: none change, except the two pause-button names if D3 = a (Charlie approves them himself).

## Decisions for Charlie

- **D1 — rotating badge (Bob agrees with A):** (A, recommended) skip, as above. (B) design a real badge first (new copy, needs your words) — not in this PR.
- **D2 — product card hover (Bob agrees with A):** The reference lifts and turns a cut-out picture. Our covers are photos that fill the 4:5 tile; turning one 3° inside the rounded clip would show empty corners. (A, recommended) the photo scales to 1.04 over 0.7 s ease-out-expo inside the clip, and the card shadow grows (already `hover:shadow-md`). Scale amount is our choice, not measured. (B) lift the whole card 4 px and keep the photo still. Both honour reduced motion.

- **D3 — marquee pause (Bob, new; needs Charlie's pick and words).** WCAG 2.2.2 says text that moves for more than 5 seconds needs a way to stop it; hiding it from screen readers does not remove the need, because the rule protects people who can see it move, and the reduced-motion setting is not enough. (a, recommended) A small pause/play icon button next to the marquee, outside the `aria-hidden` part. Screen-reader names: "Pause moving words" and "Play moving words" (new words; **Charlie must approve**). Pausing sets `animation-play-state: paused`. (b) Pause on hover only, no new words; keyboard and touch users cannot stop it; record as a known WCAG 2.2.2 gap. **Charlie chose (a) and approved "Pause moving words" and "Play moving words" (2026-10-24).** Layout: the button sits beside the marquee pill (a flex sibling, not on top of the words), outside the `aria-hidden` part, and is hidden under reduced motion because nothing moves then.

## Review Focus

1. Marquee never leaves a gap at the right edge, at 320 px and at 2560 px.
2. Marquee loop is seamless: the jump point looks the same as the start.
3. Touch devices: hover effects must not stick after a tap (`@media (hover: hover)` only).
4. Word reveal: a statement with a very long unbroken word still wraps; no layout shift while words change opacity.
5. Word reveal without JavaScript or with reduced motion shows all words at full opacity.
6. A statement that is already fully on screen at load (tall screen) starts fully visible (no fade-in blink).
7. Screen readers read the statement once, not word by word with pauses.
8. The marquee copies do not appear in text search or copy of the page text.

## Tasks

### Task 1: Marquee moves (Bob, Medium 1)

**Files:** `apps/web/src/app/_home/marquee.tsx`, `apps/web/tailwind.config.ts`, `apps/web/tests/home/marquee.test.tsx`

The live site has no categories, so its marquee holds only the 3 words "Curated · Independent · Brand by brand" (one copy about 400 px). The first design (6 copies, 40 s) would leave a gap at 2560 px and move at about 10 px/s. New design:

- [ ] Change the existing test first. It says the markup has no `animate-`/`animation`. New rules, tested with the **3 live words and no categories**: root keeps `aria-hidden="true"` and `overflow-hidden`; the track has `motion-safe:animate-marquee`; there are exactly **2 copies**; each copy has `min-w-full shrink-0` (so one copy is never narrower than the screen, for any number of words); copy 2 is `motion-reduce:hidden`; the gap and the padding sit **inside each copy** (not on the track), so the seam spacing equals the spacing between words; every word still comes from props. Show it failing on the old code.
- [ ] Keyframes `marquee`: `translateX(0)` to `translateX(-50%)`, linear, infinite. Because the track is exactly 2 copies, `-50%` is exactly one copy: the loop is seamless.
- [ ] Speed: the reference moves about 2.2 % of the screen width per second. When a copy is as wide as the screen (the live case), one loop of one copy takes `1 / 0.022` = about **45 s**, so the speed follows the screen width like the reference. Animation `marquee 45s linear infinite`. If many category names make one copy wider than the screen, it moves faster than the reference; the browser step records this for the largest case in the local database.
- [ ] Browser step uses the 3 live words at 320, 390, 767, 1440 and 2560 px: no gap at the right edge, no sideways scroll, px/s recorded.
- [ ] Pause control (D3 = a): a client `Marquee`; a `Button variant="outline" size="icon"` beside the pill with `aria-label` "Pause moving words" / "Play moving words" and a Pause/Play icon; pausing sets `animation-play-state: paused` on the track (inline style); `motion-reduce:hidden`. Tests: both names, the toggle, the button is outside the `aria-hidden` root.
- [ ] Copies use `justify-around`: between two words the space is 2s and at the seam it is s + s = 2s, so the seam looks like the rest.
- [ ] Commit.

### Task 2: Word reveal

**Files:** `apps/web/src/components/motion/word-reveal.tsx` (new), `apps/web/src/app/_home/promise.tsx`, `apps/web/tests/components/word-reveal.test.tsx` (new), `apps/web/tests/home/` promise test if one exists

- [ ] Failing tests first: server HTML contains the full statement with every word at full opacity (no inline opacity below 1); with reduced motion no scroll listener is added; with motion, words start at 0.18 only after mount and only if the statement top is below the screen bottom (already-visible statements start at 1, no blink); scrolling sets earlier words to 1 first; the sentence appears once for screen readers (see below).
- [ ] Range (chosen): progress 0 when the statement top is at 85 % of the screen height, 1 when its bottom is at 55 %. Each word opacity = 0.18 + 0.82 × clamp((progress × wordCount − index), 0, 1). `transition: opacity 150ms linear` per word.
- [ ] **No blink (Bob, Medium 2):** if the statement is already on screen at load (top above the screen bottom), add **no scroll listener at all**; it stays at full opacity. Test: start on screen, fire a scroll, every word stays at opacity 1.
- [ ] **No stuck fade (Bob, Medium 2):** progress is 1 when the page is scrolled to the bottom (`scrollY + innerHeight >= scrollHeight - 2`) and when the statement is already above the 55 % line. Test: a tall screen and a short page never leave words faded.
- [ ] **Screen readers (Bob, Low 3):** the full sentence is in one `<span className="sr-only">`, and the word spans are inside a wrapper with `aria-hidden="true"`. Test: the accessible text is the sentence once.
- [ ] `PromiseSection` swaps the statement `<p>` text for `<WordReveal text={copy.statement} />` inside the same `<p data-promise-statement>`; classes and copy unchanged.
- [ ] One passive scroll listener plus `requestAnimationFrame`; removed on unmount. Lenis scroll fires normal scroll events, so no change there.
- [ ] Commit.

### Task 3: Product card hover (per D2; Bob, Low 4 and Low 5)

**Files:** `apps/web/src/components/product-card.tsx`, `apps/web/tests/components/product-card.test.tsx`

- [ ] Failing tests first:
  - Only an **inner layer** around `CoverImage` scales (new `div` with `h-full w-full`, `transition-transform duration-700 ease-out-expo`, scale on `[@media(hover:hover)]:group-hover` **and** `group-focus-visible`, `motion-reduce:transform-none motion-reduce:transition-none`). The "New"/"Sold out" badge stays outside that layer, so it does not grow or move.
  - The clip (`aspect-tile` area, `overflow-hidden rounded-bento`) gets `isolate` so Safari keeps round corners while the photo scales.
  - Keyboard focus gets the same scale as hover (Bob, Low 5). Hover uses the `hover: hover` media query only, so a tap on a touch screen does not leave a scaled photo.
  - Scale token: add `scale-card-hover` (1.04) in the tailwind config if `ui:audit` flags an arbitrary value.
- [ ] `CoverImage`, focus ring, link, badge, text unchanged.
- [ ] Commit.

### Task 4: Gates and browser proof

- [ ] All gates in Global Constraints.
- [ ] Browser proof on the built site (Playwright with system Chrome, standalone build, HitPay vars empty): marquee at 320/390/767/1440/2560 px (no gap, no sideways scroll, px/s recorded); loop seam at the jump; word reveal opacities at three scroll positions; card hover computed `transform` before/after at 1440; `hover: none` emulation shows no scale; reduced-motion run for all three.
- [ ] Say plainly what was not seen (dark mode, touch device).
- [ ] Write the PR body to `.andy/pr-body-r6b.md`. Stop before the push. Bob reviews the branch; Charlie says "go push".
