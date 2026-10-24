# Soft-red R6: Storefront motion — Plan (Bob's review applied; D1 = A; awaiting Charlie's "go")

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Add calm, Kvist-style motion to the storefront with no change to copy, links, data or logic.

**Architecture:** One small client `Reveal` component (CSS transition + `IntersectionObserver`), CSS-only hover rules, a tiny `WordReveal`. No new animation library (Lenis stays from R2). Transform and opacity only.

**Spec:** `docs/superpowers/plans/2026-10-16-soft-red-storefront-redesign.md` (R6) and Addendum A in `2026-10-22-soft-red-r3-home.md`.

## Measured Kvist values (2026-10-24, https://demo.codeandchill.store/kvist, 1440×900, headless Chrome)

| Item                         | Measured                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Scroll reveal, blocks        | start `opacity 0` + `translateY(28px)` (cards/rows 16 px) → `1` + `none`; ease-out-expo `cubic-bezier(0.16,1,0.3,1)`, ~0.9 s |
| Reveal trigger line          | element top reaches ~750 px of a 900 px viewport (about 83 % down, ~150 px inside)                                           |
| Small items (avatars)        | `translateX(-12px)` → none, staggered inside the row                                                                         |
| Hero items at load           | they run the same reveal at load, small offsets (nav, tiles)                                                                 |
| Word reveal (statement text) | each word `<span class=inline>` starts `opacity 0.18`, rises to 1 as you scroll                                              |
| Card image hover             | `translate 0 -12px` + `rotate -3deg` (NOT scale), 0.7 s ease-out-expo, on `group-hover`                                      |
| Button arrow hover           | arrow `translateX(4px)`, 0.3 s; up-right arrow `translate(2px,-2px)`, 0.3 s                                                  |
| Button/link colour           | button 0.3 s ease-out-expo; link colour 0.15 s `cubic-bezier(0.4,0,0.2,1)`                                                   |
| Marquee                      | ~2.2 % of width per second; loop point not captured (we use a seamless duplicate)                                            |
| Rotating badge               | ~26°/s                                                                                                                       |
| Counters                     | none found on this page; not built                                                                                           |

Not measured and decided by us: stagger step = 80 ms (Kvist stagger not readable from the live page); marquee loop = duplicate track, `translateX(-50%)`.

## Global Constraints

- `prefers-reduced-motion: reduce` shows the final state at once. No marquee, no rotation, no word reveal.
- Only `transform` and `opacity`. No layout shift, no page widening at 320/390/767/1440 px.
- Server HTML stays visible. The hidden start state is set only after the script runs and only when motion is allowed (no flash, no invisible content without JS).
- No change to copy, links, `aria-` names, data or queries. Real data only.
- `ProductCard` hover (lift and rotate) is a separate slice, not in the first PR.
- **One trigger rule (Bob, Low 5):** a block shows when its top reaches 83 % down the screen (observer `rootMargin: "0px 0px -17% 0px"`, `threshold: 0`). No "15 % visible" rule. A block taller than the screen still shows, because only its top edge counts.
- **No flash (Bob, Medium 1):** on start, `Reveal` checks each block. A block already inside the screen (top above the 83 % line) stays shown with no animation and no hidden state. Only blocks below the line get the hidden start state.
- **Lists (Bob, Low 4):** put `Reveal` inside the `li`, never around it, so `ul > li` stays valid.
- **Branch (Bob, Low 5):** work on `feat/soft-red-r6a` created from `main` before the first commit. This plan file is untracked on `main` until then.
- Gates: Prettier, lint `--max-warnings 0`, `pnpm ui:audit --allow-deferred` exit 0, `ui:audit:test` 17/17, typecheck, build.
- Repo stays PRIVATE until Charlie says "go push".

## Review Focus

1. Reduced motion: no `transition`/`animation` class, content visible.
2. `Reveal` in server output is visible (no `opacity-0` in SSR HTML).
3. Marquee and badge cause no horizontal scroll at 320 px.
4. A block taller than the viewport still reveals (only its top edge must reach the 83 % line).
5. Keyboard focus on a hidden block shows it at once (Task 1 test).
6. Blocks already on screen at load never blink (Task 1 test).
7. `Reveal` inside `li` keeps the list valid (Task 2 test).

## Tasks

### Task 1: Motion tokens + `Reveal`

**Files:** `apps/web/src/components/motion/reveal.tsx` (new), `apps/web/src/app/globals.css`, `apps/web/tests/components/reveal.test.tsx` (new)

- [ ] Failing tests: SSR markup has no hidden class; with `matchMedia` reduce, no animation class is added; with motion allowed, `data-revealed` flips after the observer fires; a block already above the 83 % line at start is never hidden (no blink); `focusin` inside a hidden block shows it at once.
- [ ] Add `--ease-out-expo: cubic-bezier(0.16,1,0.3,1)` and the `.reveal` rules (28 px rise, 0.9 s, observer margin `0px 0px -17% 0px`, `delay` prop in steps of 80 ms).
- [ ] Commit.

### Task 2: Home page use

**Files:** `apps/web/src/app/page.tsx` and home section components (wrap blocks only; no copy change)

- [ ] Wrap section blocks in `Reveal`; stagger rows by 80 ms. Inside lists, `Reveal` goes inside each `li`. Add a test that `ul > li` children stay direct. Run `tests/home`.

### Task 3: Home arrow links only (Bob, Medium 2)

**Files:** `apps/web/src/app/_home/hero.tsx`

`@bomy/ui` `Button` already has its own icon-to-arrow slide (0.5 s, `motion-reduce:transition-none`, `packages/ui/src/components/button.tsx` about lines 66 to 92). It is NOT changed in R6a. Any change to it is a later, separate decision.

- [ ] `hero.tsx` line about 118: the tile arrow already has `group-hover:translate-x-1`, but with the default 150 ms. Change it to `duration-300 ease-out-expo motion-reduce:transition-none`.
- [ ] `hero.tsx` line about 101: the plain arrow has no hover slide. Check whether its parent is a `group`; if yes add the same slide, if no leave it and record why.
- [ ] No other file changes in this task.

### Task 4 (R6b, later PR, not in the first one): Marquee, badge, word reveal (`_home/marquee.tsx` already exists; check it first)

- [ ] `prefers-reduced-motion` guard first (test), then CSS keyframes. Skip any that has no matching real content.

### Task 5: Gates and browser proof

- [ ] All gates above; browser proof at 320/390/767/1440 light and dark, plus reduced-motion emulation. Write PR body to `.andy/`. Stop before push.

## Decisions for Charlie

- **D1 — first PR scope: A (Bob and Andy recommended; Charlie to confirm).** Tasks 1, 2, 3 and 5 only. Marquee, badge and word reveal go to a later PR (R6b), because they move all the time and can widen the page.
