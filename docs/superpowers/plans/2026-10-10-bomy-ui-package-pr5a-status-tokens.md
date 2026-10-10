# PR 5a — Status Tokens, Variants and Brand Sidebars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add semantic success / warning / info tokens (light and dark) and brand-navy sidebar tokens, add the matching `Badge` and `Button` variants, replace the 121 deferred palette-colour entries with tokens, and prove every colour pair, in rest, hover, focus and disabled states, in both themes.

**Architecture:** Tokens live in both `globals.css` files (HSL triplets, `:root` and `.dark`) and both `tailwind.config.ts` files, exactly like `destructive` and `reward`. A node-environment vitest parses the real CSS and asserts the contrast table, so a later token edit cannot drop below AA. New `Badge` and `Button` variants live in `@bomy/ui`. Swaps are class-for-class edits checked by the audit scanner. The sidebars become constant (theme-independent) navy chrome through `--sidebar-*` tokens.

**Tech Stack:** Next 15.5, React 19.2, Tailwind 3.4.17, Vitest 2.1.9, Playwright MCP, claude-in-chrome (admin checks only), `scripts/ui-audit/scan.mjs`.

**Spec:** `docs/superpowers/plans/2026-10-10-bomy-ui-package-pr5a-status-tokens-proposal.md` (approved 2026-10-10: D1 navy info, D2 gold reward on the membership page, D3 one value per theme at the 700 level, D4 **S2** brand-navy sidebars, D5 neutral editor toolbars, D6 dark destructive foreground fix, D7 scope split). Base `main` at `623fc62`; branch `feat/bomy-ui-package-pr5a`. Model: Sonnet for the work (announce at the start), Opus only if a token value must change.

## Global Constraints

- **Token values are fixed by this plan** (section "Token values"). They come from `docs/design-system/tokens/colors.css`, except the dark foregrounds and the sidebar set.
- **No new component.** Only the `success`, `warning` and `info` `Badge` variants and the `success` and `warning` `Button` variants. Alert and box primitives, accent pills and hand-made pills are 5d.
- **Dark mode is a requirement.** Every swapped class must read in both themes; no fixed pastel background may carry a themed token text (see the background rule in Task 3).
- **Contrast thresholds:** text 4.5:1, icons and graphics 3:1, focus ring against its surface 3:1. Disabled controls are exempt from WCAG 1.4.3 and are reported, not gated.
- **Hover rule:** solid variants use `hover:brightness-90` (as `destructive` and `reward` already do). Soft or outline variants use a tint background only when the measured ratio stays at least 4.5:1; no alpha above `/10` for `destructive` (`/10` measures 5.15:1 light and 4.60:1 dark; `/20` fails at 4.35:1 light and 3.96:1 dark).
- **Audit gates (every task):** `pnpm ui:audit --allow-deferred` exit 0 with open 0, stale 0, invalid 0. Edited lines make their entries stale: delete the entry when the line no longer contains the finding, re-key it (change only `text`) when it still does. Write JSON with `ensure_ascii=True`. Plain `pnpm ui:audit` stays exit 1.
- **Standing rules:** explicit commit paths only; `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; push and open the PR only after Charlie's go; one log per merged PR before the next; report env-limited test gaps as "not evaluated"; the Cloudflare origin lock stays parked.
- **Admin browser checks** use only Charlie's own signed-in Chrome (profile "Charlie | Work"), chosen through `switch_browser`; never mint, encode, copy or set a session cookie from `AUTH_SECRET`; otherwise "not evaluated".

## Decisions found while planning (D8 and D9 accepted by Charlie 2026-10-10)

- **D8 Toasts (accepted: theme the toasts with the status tokens).** Both toasters keep fixed light pastel banners in both themes (documented exceptions). The new dark `--success` icon on the pale banner measures **2.25:1** (info 2.29, warning 2.14), so the icons cannot take tokens unless the banners do too. **Default: themed token banners** (`border-X/30 bg-X-subtle text-X`; every pair passes, section "Contrast"), which removes the 8 toast exceptions. Alternative: leave toasts fixed and keep their icons as exceptions (deferred 122 becomes 9, not 1).
- **D9 Status-pair exceptions (accepted 2026-10-10).** The audit holds **60** palette exceptions in total (56 `R3a`, 4 `R3b`). **Only 18** of them carry the reason "no success/warning token exists"; the rest are other status pairs, role badges, toast and sidebar entries and one scrim. 5a changes **24** of the 60 (list below), which leaves **36**: 35 fixed status pairs that pass contrast today (Badge overrides, success messages, role badges, the two seller-product pills, the payout state button, the `membership/manage` and `account/subscriptions` pairs) plus one permanent exception (the `nav-bar.tsx` overlay scrim, which must stay dark in both themes). Of the 36, **16** still carry the now-wrong sentence "no success/warning token exists"; Task 8 rewords exactly those 16 to "status pair; tokens exist (PR 5a); migration tracked as man-5a2". The 35 status pairs are tracked by the new ledger entry `man-5a2` (status `deferred`, followUp `PR 5a-2`). **Plain `pnpm ui:audit` exits 0 only when scanner deferred hits and ledger deferred entries are both 0** (`scan.mjs` lines 13 and 366); exceptions do not block it, so `man-5a2` (like the 5b entry and the 5d entries) is what keeps it at exit 1 until 5a-2 lands.

  **Exceptions 5a changes (24 of 60):** toast banners 8 (Task 7, D8); admin sidebar 4 (Task 6, S2); pale backgrounds under swapped text 6 (Task 3: checkout warning box, reconciliation box, seller pending row, two checkout-sessions boxes, seller-inquiry success box); body-editor amber box 1 (Task 5); admin `youtube-embed-extension.ts` placeholder 1 (Task 5, identical to the web file that is in the 121); hand-made pills 4 (Task 4: address-manager "Default", two variant-picker pills, config "Read-only"). Task 0 Step 2 saves the exact list as `expected-changed-exceptions.json` and the 36 that must remain as `expected-remaining-exceptions.json`; Task 8 diffs `exceptions.json` against the second file.

## Token values

Triplets are `H S% L%`, rounded as the existing tokens are; the contrast below was recomputed from the rounded triplets.

| Token                      | `:root`                 | `.dark`                    |
| -------------------------- | ----------------------- | -------------------------- |
| `--success`                | `150 64% 23%`           | `150 45% 52%`              |
| `--success-foreground`     | `0 0% 100%`             | `148 41% 7%`               |
| `--success-subtle`         | `145 40% 94%`           | `150 38% 10%`              |
| `--warning`                | `36 92% 29%`            | `37 72% 56%`               |
| `--warning-foreground`     | `0 0% 100%`             | `39 79% 6%`                |
| `--warning-subtle`         | `39 87% 94%`            | `41 65% 10%`               |
| `--info`                   | `232 44% 35%`           | `230 39% 71%`              |
| `--info-foreground`        | `0 0% 100%`             | `232 50% 9%`               |
| `--info-subtle`            | `232 44% 96%`           | `231 38% 15%`              |
| `--destructive-foreground` | `0 0% 100%` (unchanged) | `3 68% 6%` (was white; D6) |
| `--sidebar`                | `231 49% 15%`           | same                       |
| `--sidebar-foreground`     | `35 30% 81%`            | same                       |
| `--sidebar-strong`         | `40 60% 98%`            | same                       |
| `--sidebar-muted`          | `35 22% 65%`            | same                       |
| `--sidebar-accent`         | `231 48% 21%`           | same                       |
| `--sidebar-border`         | `231 47% 28%`           | same                       |
| `--sidebar-indicator`      | `4 70% 62%`             | same                       |
| `--sidebar-ring`           | `5 74% 75%`             | same                       |

The sidebar set is deliberately identical in both themes (the sidebar is always-dark chrome, as before). Tailwind names: `success`, `warning`, `info` each `{ DEFAULT, foreground, subtle }`; `sidebar` `{ DEFAULT, foreground, strong, muted, accent, border, indicator, ring }`.

## Contrast (computed; the Task 1 test pins all of it)

| Pair                                                                                 |                       Light |               Dark |
| ------------------------------------------------------------------------------------ | --------------------------: | -----------------: |
| success / warning / info text, worst surface                                         |          6.75 / 5.30 / 8.90 | 6.85 / 7.27 / 6.54 |
| text on its own subtle tint                                                          |          6.81 / 5.43 / 8.89 | 6.90 / 7.18 / 6.71 |
| solid fill + foreground, rest                                                        |          7.57 / 5.94 / 9.97 | 7.59 / 8.21 / 7.63 |
| solid hover `brightness-90`                                                          |          6.90 / 5.53 / 8.83 | 6.32 / 6.80 / 6.31 |
| solid disabled (50%), report only                                                    |          2.42 / 2.20 / 2.63 | 2.77 / 2.97 / 2.78 |
| focus ring (`--ring`) vs page surface                                                |                        4.56 |               5.48 |
| focus ring vs solid fill, report only (same pattern as every existing solid variant) |                   1.25–2.07 |          1.37–1.54 |
| destructive-foreground on dark destructive: rest / hover                             |                 6.12 / 5.70 |        5.77 / 4.80 |
| `text-destructive` on `bg-destructive/10` (card)                                     |                        5.15 |               4.60 |
| outline-soft success hover (`bg-success-subtle`)                                     |                        6.81 |               6.90 |
| membership price box `bg-reward/10`: `text-foreground`                               |                       16.29 |              13.78 |
| sidebar: strong / foreground / muted on `--sidebar`                                  |        16.40 / 11.27 / 7.39 |               same |
| sidebar: strong / foreground / muted on `--sidebar-accent` (hover, active)           |         14.33 / 9.84 / 6.46 |               same |
| sidebar indicator and ring vs `--sidebar` / `--sidebar-accent`                       | 4.98 / 4.35 and 7.78 / 6.80 |               same |

Today's sidebar failures that S2 removes: footer email `slate-500` on `slate-800` 3.07:1; `slate-400` on the `slate-700` hover 4.04:1; `border-primary` indicator (red-600) on navy would be 2.77:1, so the indicator token is red-400.

## Review Focus

- **Pastel under token text.** A swapped text line whose background is a palette-class exception would pass in light and fail in dark (checkout warning box, reconciliation box, seller pending row, checkout-sessions boxes, seller-inquiry success box). Task 3's background rule and Task 9's dark screenshots cover it.
- **Alpha modifiers.** `bg-reward/10`, `border-warning/40`, `border-destructive/30` need Tailwind's `hsl(var(--x))` alpha handling and the `content` globs to see the classes; Task 2 greps the built CSS for each class.
- **Rounded triplets** change colours slightly; the test reads the CSS, not hex.
- **Web and admin drift.** Two copies of the tokens: the test fails if the new tokens differ between the two `globals.css` files.
- **Focus on the navy sidebar.** The default red ring is 3.56:1 on navy; the plan adds `--sidebar-ring` (7.78:1) to every sidebar link and button.
- **Admin sign-in and shell colour**: `bg-slate-900` becomes `bg-sidebar`; the sign-in card must still read (Task 6 screenshot).
- **Existing tests assert `border-primary`** on active sidebar links (web 4 assertions, admin 1); they change with S2.

## Admin role safety (same as PR 5c)

Original role of `charliekong.work@gmail.com` is `buyer` (saved in `scratchpad/pr5a/original-admin-role.txt` before any change). Promote to `bomy_admin` only for an admin browser session, run a role check at the start of every admin step, restore `buyer` after each session (including an interrupted one), and record the final check in the log. Never copy or mint a session cookie.

## File map

- Modify `apps/web/src/app/globals.css`, `apps/admin/src/app/globals.css`, `apps/web/tailwind.config.ts`, `apps/admin/tailwind.config.ts` (tokens).
- Create `apps/web/tests/design-tokens/contrast.test.ts` (token contrast and state matrix; node environment).
- Modify `packages/ui/src/components/badge.tsx`, `packages/ui/src/components/button.tsx`; create `apps/web/tests/components/status-variants.test.tsx`.
- Swap files (121 entries in 35 files): the lists in Tasks 3 to 6.
- Modify `scripts/ui-audit/deferred.json`, `exceptions.json`, `findings.json`.
- Temporary, **never committed**: `apps/web/src/app/pr5a-states/page.tsx` (variant and state harness, Task 1 Step 8).

---

### Task 0: Branch, baseline and sidebar "before" screenshots

**Files:** none committed. Scratchpad `scratchpad/pr5a/`.

- [ ] **Step 1:** `git checkout main && git pull --ff-only`, `git checkout -b feat/bomy-ui-package-pr5a`. Announce `Model: Sonnet — reason: token CSS, variants and class swaps`. Save the original admin role to `scratchpad/pr5a/original-admin-role.txt`.
- [ ] **Step 2: Audit snapshot** `pnpm ui:audit --allow-deferred`: expect total 283, covered 161, deferred 122, open 0, stale 0; ledger deferred 49, resolved 45. Save the output and the 121 deferred 5a entries (`deferred.json` where `followUp` contains `5a`) to `before-audit.txt` and `before-5a-entries.json`. Also record the exception count (161; 60 are palette exceptions) and save the two expected lists: `expected-changed-exceptions.json` (the 24 in D9) and `expected-remaining-exceptions.json` (the other 36; a first copy of the 37-entry list is in `scratchpad/remaining-exceptions.json`: rebuild it with the same predicates and drop the admin YouTube entry so it holds 36).
- [ ] **Step 3: Sidebar "before" screenshots, light and dark.**
  - Seller (Playwright, seeded seller `4a18dc0e-30f1-446d-bc60-5592b4d37044@test.bomy`, dev server on 3000, theme set by `localStorage.theme`, mouse away): `/seller/dashboard` at **1440×900** and **390×844**, light and dark, plus `/seller/dashboard/orders` at 390 (active tab), plus a hover state and a keyboard-focus state of one link at 1440. Save `before-seller-{1440,390}-{light,dark}.png`, `before-seller-orders-390-{light,dark}.png`, `before-seller-hover-1440-{light,dark}.png`, `before-seller-focus-1440-{light,dark}.png`.
  - Admin (Charlie's Chrome: confirm the browser with `switch_browser`, then check the signed-in account is `charliekong.work@gmail.com`; promote the role; admin dev or production server on 3002): same-origin iframe of `/stores` at 1440 and at 390 (menu open for 390), light and dark (toggle the `dark` class on the iframe's `<html>`), plus the sign-in page `/auth/sign-in` (open in a logged-out iframe or capture before login). Capture each with `computer screenshot` (`save_to_disk: true`), name them `before-admin-{1440,390}-{light,dark}.png`, `before-admin-signin-{light,dark}.png`.
  - If the admin browser step cannot run, the admin "before" and "after" screenshots are **not evaluated**; do not substitute another browser.
- [ ] **Step 4: Status-text baseline.** Measure today's computed text and background colours (and contrast) for one instance of each group on the pages listed in Tasks 3 to 5 in light and dark (a script that reads `getComputedStyle` from a rendered page). Save as `before-status-contrast.json` for the PR before/after table. Restore the admin role; stop servers.

### Task 1: Tokens, Tailwind names and the contrast test

**Files:** modify both `globals.css` and both `tailwind.config.ts`; create `apps/web/tests/design-tokens/contrast.test.ts`.

**Interfaces:** Produces the Tailwind classes `text-success`, `bg-success`, `text-success-foreground`, `bg-success-subtle` (and the same for `warning` and `info`), and `bg-sidebar`, `text-sidebar-foreground`, `text-sidebar-strong`, `text-sidebar-muted`, `bg-sidebar-accent`, `border-sidebar-border`, `border-sidebar-indicator`, `ring-sidebar-ring`.

- [ ] **Step 1: Write the failing test** `apps/web/tests/design-tokens/contrast.test.ts`:

```ts
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

type RGB = [number, number, number]
const ROOT = resolve(__dirname, "../../../..")
const FILES = ["apps/web/src/app/globals.css", "apps/admin/src/app/globals.css"]

function block(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`no ${selector} block`)
  return css.slice(start, css.indexOf("\n  }", start))
}
function tokens(css: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of block(css, selector).matchAll(/--([a-z-]+):\s*([0-9]+ [0-9]+% [0-9]+%)/g)) {
    out[m[1]!] = m[2]!
  }
  return out
}
function rgb(triplet: string): RGB {
  const [h, s, l] = triplet.match(/[0-9.]+/g)!.map(Number) as [number, number, number]
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [f(0), f(8), f(4)]
}
const lum = ([r, g, b]: RGB) => {
  const c = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
}
const ratio = (a: RGB, b: RGB) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}
const over = (fg: RGB, bg: RGB, alpha: number): RGB =>
  fg.map((v, i) => v * alpha + bg[i]! * (1 - alpha)) as RGB
const bright = (c: RGB, k: number): RGB => c.map((v) => Math.min(1, v * k)) as RGB

const THEMES = [
  { name: "light", selector: ":root" },
  { name: "dark", selector: ".dark" },
] as const

describe.each(FILES)("%s", (file) => {
  const css = readFileSync(resolve(ROOT, file), "utf8")
  describe.each(THEMES)("$name", ({ selector }) => {
    const t = tokens(css, selector)
    const get = (n: string) => {
      const v = t[n]
      if (!v) throw new Error(`missing --${n} in ${selector}`)
      return rgb(v)
    }
    const surfaces = ["background", "card", "muted", ...(selector === ".dark" ? ["popover"] : [])]

    for (const s of ["success", "warning", "info"] as const) {
      it(`${s}: text on every surface and on its own tint is >= 4.5`, () => {
        for (const surf of surfaces) expect(ratio(get(s), get(surf))).toBeGreaterThanOrEqual(4.5)
        expect(ratio(get(s), get(`${s}-subtle`))).toBeGreaterThanOrEqual(4.5)
      })
      it(`${s}: solid fill with foreground, rest and hover (brightness-90) >= 4.5`, () => {
        expect(ratio(get(`${s}-foreground`), get(s))).toBeGreaterThanOrEqual(4.5)
        expect(
          ratio(bright(get(`${s}-foreground`), 0.9), bright(get(s), 0.9)),
        ).toBeGreaterThanOrEqual(4.5)
      })
      it(`${s}: icon on its tint is >= 3`, () => {
        expect(ratio(get(s), get(`${s}-subtle`))).toBeGreaterThanOrEqual(3)
      })
    }

    it("focus ring against every surface is >= 3", () => {
      for (const surf of surfaces) expect(ratio(get("ring"), get(surf))).toBeGreaterThanOrEqual(3)
    })
    it("destructive solid with foreground, rest and hover >= 4.5", () => {
      expect(ratio(get("destructive-foreground"), get("destructive"))).toBeGreaterThanOrEqual(4.5)
      expect(
        ratio(bright(get("destructive-foreground"), 0.9), bright(get("destructive"), 0.9)),
      ).toBeGreaterThanOrEqual(4.5)
    })
    it("text-destructive on bg-destructive/10 over the card is >= 4.5", () => {
      const tint = over(get("destructive"), get("card"), 0.1)
      expect(ratio(get("destructive"), tint)).toBeGreaterThanOrEqual(4.5)
    })
    it("membership price box: foreground text on bg-reward/10 over the card is >= 4.5", () => {
      const tint = over(get("reward"), get("card"), 0.1)
      expect(ratio(get("foreground"), tint)).toBeGreaterThanOrEqual(4.5)
      expect(ratio(get("muted-foreground"), tint)).toBeGreaterThanOrEqual(4.5)
    })
    it("sidebar: text, hover and active pairs, indicator and ring", () => {
      for (const bg of ["sidebar", "sidebar-accent"]) {
        expect(ratio(get("sidebar-strong"), get(bg))).toBeGreaterThanOrEqual(4.5)
        expect(ratio(get("sidebar-foreground"), get(bg))).toBeGreaterThanOrEqual(4.5)
        expect(ratio(get("sidebar-muted"), get(bg))).toBeGreaterThanOrEqual(4.5)
        expect(ratio(get("sidebar-indicator"), get(bg))).toBeGreaterThanOrEqual(3)
        expect(ratio(get("sidebar-ring"), get(bg))).toBeGreaterThanOrEqual(3)
      }
    })
  })
})

describe("the two apps share one token set", () => {
  const names = [
    "success",
    "success-foreground",
    "success-subtle",
    "warning",
    "warning-foreground",
    "warning-subtle",
    "info",
    "info-foreground",
    "info-subtle",
    "destructive-foreground",
    "sidebar",
    "sidebar-foreground",
    "sidebar-strong",
    "sidebar-muted",
    "sidebar-accent",
    "sidebar-border",
    "sidebar-indicator",
    "sidebar-ring",
  ]
  it.each([":root", ".dark"])("%s values are identical in web and admin", (selector) => {
    const [web, admin] = FILES.map((f) => tokens(readFileSync(resolve(ROOT, f), "utf8"), selector))
    for (const n of names) expect(web![n], n).toBeDefined()
    for (const n of names) expect(admin![n], n).toBe(web![n])
  })
})
```

Run `pnpm --filter @bomy/web exec vitest run tests/design-tokens/contrast.test.ts`: fails (`missing --success`).

- [ ] **Step 2: Add the tokens** to `:root` and `.dark` of **both** `globals.css` files (values from the table; the sidebar block goes in `:root` and is repeated in `.dark` with the same values; replace the `.dark` `--destructive-foreground` line `0 0% 100%` with `3 68% 6%` and add a comment `/* dark ink: white on red-400 is 3.41:1 */`). Add to both `tailwind.config.ts` colors:

```ts
success: {
  DEFAULT: "hsl(var(--success))",
  foreground: "hsl(var(--success-foreground))",
  subtle: "hsl(var(--success-subtle))",
},
warning: {
  DEFAULT: "hsl(var(--warning))",
  foreground: "hsl(var(--warning-foreground))",
  subtle: "hsl(var(--warning-subtle))",
},
info: {
  DEFAULT: "hsl(var(--info))",
  foreground: "hsl(var(--info-foreground))",
  subtle: "hsl(var(--info-subtle))",
},
sidebar: {
  DEFAULT: "hsl(var(--sidebar))",
  foreground: "hsl(var(--sidebar-foreground))",
  strong: "hsl(var(--sidebar-strong))",
  muted: "hsl(var(--sidebar-muted))",
  accent: "hsl(var(--sidebar-accent))",
  border: "hsl(var(--sidebar-border))",
  indicator: "hsl(var(--sidebar-indicator))",
  ring: "hsl(var(--sidebar-ring))",
},
```

- [ ] **Step 3: Run the test:** all 54 cases pass (13 per theme per file, 52, plus 2 for the shared token set). Print the measured ratios once (a one-off `console.log` run, not committed) and compare with the "Contrast" table; any value under its threshold stops the task and goes back to Charlie (a token value would change).
- [ ] **Step 4: Mutation checks.** (a) `--warning` light `36 92% 29%` to `36 92% 40%`: the warning text test fails. (b) `.dark` `--destructive-foreground` back to `0 0% 100%`: the destructive test fails. (c) change one value in the admin copy only: the "share one token set" test fails. Restore each.
- [ ] **Step 5: Format, types, lint** (`prettier --check`, `pnpm --filter @bomy/web typecheck`, `pnpm --filter @bomy/admin typecheck`, both `lint`, each run directly); audit gate.
- [ ] **Step 6: Build proof for alpha classes.** Temporarily add a throwaway file under `apps/web/src/` containing the strings `bg-reward/10 border-warning/40 border-destructive/30 bg-success-subtle hover:brightness-90` in a `className`, run `pnpm --filter @bomy/web build`, grep `.next/static/css/*.css` for `.bg-reward\/10`, `.border-warning\/40`, `.border-destructive\/30`, `.bg-success-subtle`; delete the throwaway file. Record "found" or stop.
- [ ] **Step 7: Commit** the four config files and the test: `feat(ui): success, warning, info and sidebar tokens; dark destructive foreground`.
- [ ] **Step 8: States harness (never committed).** Create `apps/web/src/app/pr5a-states/page.tsx`, a page that renders, in a light and a dark column, each of: `Button` success / warning / destructive / reward / outline (soft success and soft destructive classes from Task 4) with `disabled` and enabled copies; `Badge` success / warning / info; `bg-X-subtle` panels with `text-X`; a sidebar sample (`bg-sidebar` with `text-sidebar-*`, `bg-sidebar-accent`, `border-sidebar-indicator` link). It is used in Task 9 for the state check and deleted there.

### Task 2: Badge and Button variants

**Files:** modify `packages/ui/src/components/badge.tsx` and `button.tsx`; create `apps/web/tests/components/status-variants.test.tsx`.

- [ ] **Step 1: Write the failing test** (renderToStaticMarkup, like `button-slide.test.tsx`):

```tsx
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Badge } from "@bomy/ui/badge"
import { Button } from "@bomy/ui/button"

describe("status variants", () => {
  it.each([
    ["success", "bg-success-subtle", "text-success"],
    ["warning", "bg-warning-subtle", "text-warning"],
    ["info", "bg-info-subtle", "text-info"],
  ] as const)("Badge %s uses its subtle tint and text token", (variant, bg, text) => {
    const html = renderToStaticMarkup(<Badge variant={variant}>x</Badge>)
    expect(html).toContain(bg)
    expect(html).toContain(text)
  })
  it.each([
    ["success", "bg-success", "text-success-foreground"],
    ["warning", "bg-warning", "text-warning-foreground"],
  ] as const)(
    "Button %s is a solid fill with its foreground and a brightness hover",
    (variant, bg, fg) => {
      const html = renderToStaticMarkup(<Button variant={variant}>x</Button>)
      expect(html).toContain(bg)
      expect(html).toContain(fg)
      expect(html).toContain("hover:brightness-90")
      expect(html).not.toMatch(/\b(?:bg|text)-(?:green|amber|emerald|yellow|blue)-/)
    },
  )
})
```

Run it: fails (the variants do not exist).

- [ ] **Step 2: Implement.** In `badge.tsx` add to `variants.variant`:

```ts
success: "border-transparent bg-success-subtle text-success",
warning: "border-transparent bg-warning-subtle text-warning",
info: "border-transparent bg-info-subtle text-info",
```

In `button.tsx` add to `variants.variant`:

```ts
success: "bg-success text-success-foreground shadow-sm hover:brightness-90",
warning: "bg-warning text-warning-foreground shadow-sm hover:brightness-90",
```

- [ ] **Step 3: Checks:** the test passes (2 + 3 + 2 = 7 cases); `prettier`, both `typecheck`, both `lint`; mutation: change `hover:brightness-90` to `hover:bg-success/90` in the success variant: the test fails; restore. Audit gate.
- [ ] **Step 4: Commit:** `feat(ui): Badge success, warning, info variants; Button success and warning variants`.

### Task 3: Status text, status maps, poller icons (groups A, B, D; 47 entries)

**Files (swaps):**

- A (21): `web/checkout/_form.tsx` (lines 22, 23, 24, 25), `web/account/orders/[orderId]/page.tsx` (2), `web/products/[storeSlug]/[productSlug]/variant-picker.tsx` (26), `web/seller/dashboard/subscriptions/page.tsx` (45 to 49), `web/seller/dashboard/products/[id]/edit/product-edit-form.tsx` (the `text-green-600` link button, 34), `web/components/body-editor.tsx` ("Saved." and the upload error lines; the "Uploading" progress line is Task 5), `admin/checkout-sessions/[sessionId]/page.tsx`, `admin/orders/[orderId]/_create-payout-button.tsx` (also replace the plain `<a href="/payouts">` in the success text with `next/link` `Link`; resolves man-t28), `admin/stores/new/store-provisioning-fields.tsx`, `admin/payouts/reconciliation/page.tsx` (2), `admin/seller-inquiries/reject-button.tsx`.
- B (18): `admin/brand-plans`, `brand-subscriptions`, `goodie-box`, `memberships`, `stores` `page.tsx` status maps; `web/seller/dashboard/products/page.tsx` (`archived`).
- D (8): `web/(marketing)/membership/success/poller.tsx` (icon and tint rows; the amber CTA lines 12 and 15 belong to Task 4), `web/brands/[slug]/subscribe/success/poller.tsx`.

**Class map (mechanical):**

| Old                                                                       | New                                       |
| ------------------------------------------------------------------------- | ----------------------------------------- |
| `text-green-500/600/700`, `text-emerald-600`                              | `text-success`                            |
| `text-amber-500/600/700/800`, `text-yellow-700/800` (status or note text) | `text-warning`                            |
| `text-blue-600/700` (status text)                                         | `text-info`                               |
| `text-red-500/600/700` (status text)                                      | `text-destructive`                        |
| `text-slate-500` (cancelled, neutral state)                               | `text-muted-foreground`                   |
| `bg-slate-100 text-slate-500` (archived badge)                            | `bg-muted text-muted-foreground`          |
| `bg-green-50` / `bg-amber-50` (poller tint)                               | `bg-success-subtle` / `bg-warning-subtle` |

Admin status maps keep their object shape (`pending: "text-warning"`, `active: "text-success"`, `delivered: "text-info"`, `cancelled: "text-muted-foreground"`, `expired`/`payment_failed`/`suspended: "text-destructive"`); the amber "pending" and poller pending spinner become the warning pair. A user who sees `expired` and `payment_failed` in the same red loses the old red-500 / red-700 difference: acceptable, both are failure states (stated in the PR).

- [ ] **Step 1: Failing check.** `pnpm ui:audit --allow-deferred` still lists the 47 entries (record the count by file).
- [ ] **Step 2: Background rule (find before edit).** For every swapped line, read its enclosing elements up to the card or page. If a background is a palette class (an exception today), convert it in this task: known cases are `checkout/_form.tsx` yellow box (R3b exception `bg-yellow-50`, border `border-yellow-200`) to `border-warning/30 bg-warning-subtle`; `admin/payouts/reconciliation/page.tsx` yellow box to the same; `seller/dashboard/subscriptions/page.tsx` `<tr className="bg-amber-50">` to `bg-warning-subtle`; `admin/checkout-sessions/[sessionId]/page.tsx` yellow `<p>` and green `Card` to `warning` and `success` pairs; `admin/seller-inquiries/[id]/page.tsx` green result box to the success pair (the red box is Task 5). Remove each converted exception from `exceptions.json`. Never leave a token text on a palette pastel.
- [ ] **Step 3: Apply the class map** to the files above with a script that asserts the per-file replacement count before writing (e.g. `subscriptions/page.tsx`: 5 text swaps, 1 row background), then `prettier --write` only those files.
- [ ] **Step 4: Checks.** typecheck and lint for both apps, run directly; the web and admin test suites (expect no new failures; the two `DATABASE_URL` web files and the 13 admin files remain "not evaluated"); audit gate (deleted entries = 47 plus the converted exceptions removed; stale 0). Browser: Task 9.
- [ ] **Step 5: Commit** explicit paths: `fix(web,admin): status colours use the success, warning, info and destructive tokens`.

### Task 4: Solid buttons, membership promo, product-form panel (groups E, F, G; 28 entries)

**Files and rules (28 deferred entries plus 3 ledger pills):**

- E (10): `seller/dashboard/orders/[orderId]/_mark-delivered-button.tsx` (`bg-green-700 hover:bg-green-800 text-white` becomes `variant="success"`); `product-edit-form.tsx` (line 43 `bg-green-600 ... text-white hover:bg-green-700` becomes `variant="success"`, keep spacing and `disabled:` classes); `admin/payouts/_payout-actions.tsx` (`bg-green-600 text-white hover:bg-green-700` becomes `variant="success"`; the soft pair `bg-green-100 text-green-700 hover:bg-green-200` becomes `variant="outline" className="border-success/40 text-success hover:bg-success-subtle hover:text-success"`; `bg-red-100 text-red-700 hover:bg-red-200` becomes `variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"`); `admin/vouchers/page.tsx` (`bg-amber-600 text-white hover:bg-amber-700` becomes `variant="warning"`); `image-manager.tsx` (`bg-red-500 ... text-white` becomes `bg-destructive text-destructive-foreground`, hover `hover:brightness-90`); `admin/seller-inquiries/[id]/approve-form.tsx` (`border-amber-300 text-amber-700 hover:bg-amber-50` becomes `border-warning/40 text-warning hover:bg-warning-subtle`); membership and poller CTAs (4: lines 8, 9, 12, 15) become `variant="reward"`, dropping the amber bg, text, hover and active classes.
- F (10, `(marketing)/membership/page.tsx`): eyebrow `text-amber-500` becomes `text-primary`; price box `bg-amber-50` becomes `bg-reward/10`; price `text-amber-600` becomes `text-foreground`; caption `text-amber-700` becomes `text-muted-foreground`; the four `✓` marks `text-amber-500` become `text-primary` (they sit on the page surface, not the box; the box holds only foreground and muted text, as the contrast test pins).
- G (8, `product-edit-form.tsx`): panel `bg-green-50` becomes `bg-muted`; labels and `days` `text-green-700` become `text-muted-foreground`.
- **Pills for the ledger (not among the 121; they are accepted exceptions today):** `web/account/addresses/address-manager.tsx` "Default" pill `rounded bg-green-100 px-2 py-0.5 text-xs text-green-700` becomes `<Badge variant="success">Default</Badge>` (man-t02); `variant-picker.tsx` back-order pill `bg-orange-100 ... text-orange-700` becomes `Badge variant="warning"` and pre-order pill `bg-blue-100 ... text-blue-700` becomes `Badge variant="info"` (man-t03); `admin/config/page.tsx` "Read-only" pill `rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700` becomes `Badge variant="warning"` (man-t21). Remove those four exceptions. If a test asserts the old classes, update it; otherwise add none.

- [ ] **Step 1: Failing check:** audit lists the 28 entries plus the 4 pill exceptions (and the Task 2 tests already pass).
- [ ] **Step 2: Apply** with per-file replacement-count assertions; `prettier --write` on those files only.
- [ ] **Step 3: Checks:** typecheck, lint, tests, audit gate as in Task 3; confirm no `bg-amber`, `bg-green` or `text-white` remains in the touched button lines.
- [ ] **Step 4: Commit:** `fix(web,admin): action buttons use Button variants; membership promo uses reward tokens`.

### Task 5: Editor toolbars, video placeholder, remaining lines (groups H, J; 25 entries)

**Files and rules (25 deferred entries plus 2 exceptions):**

- `web/components/body-editor.tsx` and `admin/components/brand-story-field.tsx`: dividers `bg-gray-300` (4 each) and `bg-blue-200` (3 and 2) become `bg-border`; the table strip `border-blue-100 bg-blue-50` becomes `border-border bg-muted`; label `text-blue-600` becomes `text-muted-foreground`; the "Uploading… N%" line `text-blue-600` becomes `text-muted-foreground`; active `bg-blue-200 text-blue-800` becomes `bg-accent text-accent-foreground`; idle `text-blue-700 hover:bg-blue-100` becomes `text-muted-foreground hover:bg-accent hover:text-accent-foreground`; danger `text-red-600 hover:bg-red-100` becomes `text-destructive hover:bg-destructive/10`; the body editor's amber status box (exception) becomes `border-warning/30 bg-warning-subtle text-warning`.
- `admin/components/brand-story-field.tsx` `TableControlButton` (raw `<button>`): becomes `<Button type="button" variant="ghost" size="sm" ...>` with the same classes mapped as above; keep `aria-label`, `title` and the focus behaviour; add a test only if the component has an existing one (grep first).
- `web/components/youtube-embed-extension.ts` and the identical `admin/components/youtube-embed-extension.ts` placeholder `bg-gray-900 text-white` become `bg-foreground text-background` (what `video-embed.tsx` already uses for the same element; the admin copy is an accepted exception today, and the exception is removed).
- `admin/seller-inquiries/[id]/page.tsx` line with `border-red-200 bg-destructive/10 text-destructive` becomes `border-destructive/30 ...`.

- [ ] **Step 1:** failing check (25 entries listed). **Step 2:** apply with count assertions. **Step 3:** checks as in Task 3. **Step 4:** commit `fix(web,admin): editor toolbars and placeholders use neutral tokens`.

### Task 6: Brand-navy sidebars (group I, S2; 13 entries + 4 exceptions)

**Files:** `web/seller/dashboard/layout.tsx`, `admin/components/sidebar.tsx`, `admin/components/theme-toggle.tsx`, `admin/app/auth/sign-in/page.tsx`, `web/seller/dashboard/page.tsx` (the `text-slate-300` dash becomes `text-muted-foreground`; it sits on the page, not the sidebar), tests `web/tests/seller-dashboard/layout.test.tsx` and `admin/tests/components/sidebar.test.tsx`.

**Class map (sidebars only):**

| Old                                                                      | New                                                                                                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `bg-slate-800`                                                           | `bg-sidebar`                                                                                                                                |
| `text-slate-400`                                                         | `text-sidebar-muted`                                                                                                                        |
| `text-slate-500` (footer email)                                          | `text-sidebar-muted` (3.07 becomes 7.39)                                                                                                    |
| `text-slate-300` (sign-out button)                                       | `text-sidebar-foreground`                                                                                                                   |
| `text-slate-100` (title, active, hover)                                  | `text-sidebar-strong`                                                                                                                       |
| `border-slate-700`                                                       | `border-sidebar-border`                                                                                                                     |
| `bg-slate-700` (active and hover background)                             | `bg-sidebar-accent`                                                                                                                         |
| `hover:text-slate-100`                                                   | `hover:text-sidebar-strong`                                                                                                                 |
| `border-primary` (active indicator, both layouts)                        | `border-sidebar-indicator`                                                                                                                  |
| `bg-slate-900` (admin sign-in page)                                      | `bg-sidebar`                                                                                                                                |
| new on every sidebar link, menu button, theme toggle and sign-out button | `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring` (the sign-out `Button` also keeps `arrowOnHover={false}`) |

The sidebar remains the same dark chrome in both themes; do not add `dark:` variants.

- [ ] **Step 1: Update the tests first (red).** `layout.test.tsx` lines asserting `border-primary` (4) become `border-sidebar-indicator`; `sidebar.test.tsx` line 121 `border-primary` becomes `border-sidebar-indicator`. Add one assertion per file that no `slate-` class remains in the sidebar markup (`expect(container.innerHTML).not.toMatch(/slate-/)`). Run: fails.
- [ ] **Step 2: Apply the class map.** Re-key or delete the 13 deferred entries and the 4 admin sidebar exceptions (`aside`, `header`, active link, hover link: the lines change, so the exceptions are removed).
- [ ] **Step 3: Checks:** both suites pass (web layout 8 tests, admin sidebar 9 and the new assertions); mutation: put `border-primary` back on one active link: the test fails; restore. typecheck, lint, `prettier`, audit gate.
- [ ] **Step 4: Commit:** `feat(web,admin): sidebars use the brand-navy sidebar tokens`.

### Task 7: Toast banners (D8 accepted; 8 entries + 8 exceptions)

**Accepted (D8):** in `web/components/toaster.tsx` and `admin/components/toaster.tsx` replace the four `TOAST_STYLES` entries:

```ts
success: { icon: <CircleCheck className="size-5 text-success" aria-hidden="true" />, className: "border-success/30 bg-success-subtle text-success" },
info:    { icon: <Info className="size-5 text-info" aria-hidden="true" />,        className: "border-info/30 bg-info-subtle text-info" },
warning: { icon: <CircleAlert className="size-5 text-warning" aria-hidden="true" />, className: "border-warning/30 bg-warning-subtle text-warning", srLabel: "Warning" },
error:   { icon: <CircleX className="size-5 text-destructive" aria-hidden="true" />, className: "border-destructive/30 bg-destructive/10 text-destructive", srLabel: "Error" },
```

and rewrite the comment above `TOAST_STYLES` (the fixed-pastel rationale no longer applies; the token text flips with the theme and every pair passes). Remove the 8 toast exceptions and the 8 deferred icon entries. If a toast test asserts classes (grep `tests` for `emerald` returned none), keep it passing. If Charlie chooses the alternative (fixed pastel), skip the swap, keep the exceptions and move the 8 icon entries to exceptions with reason "fixed pastel banner by design (D8)".

- [ ] **Steps:** failing audit check; apply; checks (tests, typecheck, lint, audit gate); browser check of a toast in light and dark in Task 9; commit `fix(web,admin): toast banners use the status tokens`.

### Task 8: Audit lists and ledger

**Files:** `scripts/ui-audit/deferred.json`, `exceptions.json`, `findings.json`.

- [ ] **Step 1:** Confirm every 5a deferred entry is gone from `deferred.json` (121 removed or moved); only the 5b `R1-select` entry remains: scanner deferred 122 becomes **1**. Exceptions: total 161 becomes **137** (161 minus the 24 changed); the 60 palette exceptions become **36**; diff the palette exceptions against `expected-remaining-exceptions.json` (must match exactly). Reword the **16** remaining exceptions whose reason says "no success/warning token exists" to "status pair; tokens exist (PR 5a); migration tracked as man-5a2"; leave the other 20 reasons unchanged (they are accurate). Report the final counts.
- [ ] **Step 2: Ledger** (evidence names the commit and the measurement; delete `followUp` on resolved entries): resolve `man-b17` (sidebar), `man-t02`, `man-t03`, `man-t21` (Task 4 Badge swaps), `man-t28` (Task 3 `Link`) and `man-t30` (reject and approve now share the warning styling), each only if the code on the branch matches (otherwise re-target it to 5d); re-target `man-t08`, `man-t09`, `man-t18`, `man-t26`, `man-t27`, `man-b9` to `PR 5d: ...`; add `man-5a2` (kind `manual`, status `deferred`, followUp `PR 5a-2: ...`). Expected projection: ledger deferred **49 to 44** (six resolve, six stay deferred and are re-targeted to 5d, `man-5a2` is added: 49 − 6 + 1). **Report the measured count after Task 8**; if fewer than six resolve, the count is higher and the difference is named.
- [ ] **Step 3: Gates:** `pnpm ui:audit --allow-deferred` exit 0 (open 0, stale 0, invalid 0); `pnpm ui:audit:test` 17 of 17; plain `pnpm ui:audit` exit 1 (expected: scanner deferred 1, ledger deferred 44). Commit `docs(ui): resolve the PR 5a colour findings`.

### Task 9: Full verification, state matrix and screenshots

- [ ] **Step 0:** role check (admin role safety); switch to Charlie's Chrome with `switch_browser` and confirm the account.
- [ ] **Step 1: Full checks, each run directly:** `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm --filter @bomy/web test --run`, `pnpm --filter @bomy/admin test --run`, `pnpm --filter @bomy/web build`, `pnpm --filter @bomy/admin build`. Expected new tests: web +61 cases (54 contrast, 7 variants); admin +0 (assertions are added to the existing sidebar and layout tests). Report the totals as printed. Report totals as printed; the two `DATABASE_URL` web files and 13 admin files stay "not evaluated"; a web exit 1 with the expected passed count is stated as both.
- [ ] **Step 2: State matrix in the browser** (harness page from Task 1 Step 8, Playwright, light and dark): for each variant measure computed `color` and `background-color` (resolve `filter: brightness`) at rest, `hover`, `:focus-visible` (keyboard Tab) and `disabled`, and compute the contrast. Gate: rest and hover text at least 4.5, focus ring against surface at least 3; **report** disabled (expected 2.2 to 3.0) and ring against fill (1.25 to 2.07). Save `after-states.json`. Delete the harness page afterwards and confirm `git status` no longer lists it.
- [ ] **Step 3: Page checks, light and dark** (Playwright for web, Charlie's Chrome iframes for admin): one instance per group renders and each swapped text meets 4.5:1 against its computed background (script reading `getComputedStyle`), comparing with `before-status-contrast.json`. Include a real toast in each app, the membership page (price box, check marks, CTA), the product edit form panel, the payout actions, and every Task 3 background-rule page.
- [ ] **Step 4: Sidebar "after" screenshots, light and dark, both sidebars** (same pages, sizes and states as Task 0 Step 3): `after-seller-{1440,390}-{light,dark}.png`, `after-seller-orders-390-*`, `after-seller-hover-1440-*`, `after-seller-focus-1440-*`, `after-admin-{1440,390}-{light,dark}.png` (390 with the menu open), `after-admin-signin-{light,dark}.png`. Build a before/after contact sheet per sidebar (PIL) for Charlie's and Bob's review. Verify: the active indicator is visible, the keyboard focus ring is visible on navy, the sign-out button is visible, the sidebar edge against the dark page reads (measured 1.10:1; same situation as slate today), and the sign-in card reads on the navy background. Charlie's Chrome only; otherwise admin "not evaluated".
- [ ] **Step 5: Layout non-regression.** Re-run the PR 5c 390 px gate (31 routes) and the 768 px admin gate (22): all still pass (colour changes must not change widths); desktop sidebar geometry unchanged (176 px admin, `w-52` seller, link positions identical).
- [ ] **Step 6: Clean up.** Stop servers (3000 to 3002 clear), delete `apps/admin/.next` (stale generated types), restore the admin role to `buyer` and record the check, close the Chrome tab if it is in the group.

### Task 10: Pull request (only after Charlie's go)

- [ ] Push `feat/bomy-ui-package-pr5a`, open the PR with a body that includes: the token table; the contrast table with the hover, focus and disabled results; the before/after contact sheets for both sidebars; the visible-change list; D8 and D9 outcomes; the ledger and audit numbers; the 5a-2 follow-up; "not evaluated" items (DATABASE_URL files, any admin browser step that could not run, browsers other than Chromium, APCA). After the merge: log `log/2026-10-1x_PR<N>_status-tokens.md`, handoff, memory, branch cleanup.

## Self-review

- **Spec coverage:** D1 (Task 1 values), D2 and D5 (Tasks 4, 5), D3 (values), D4 S2 (Task 6), D6 (Task 1 destructive foreground), D7 (Tasks 2 to 8 scope; Alert, accent pills, hand-made pills stay 5d), hover, focus and disabled checks (Task 1 test plus Task 9 Step 2), both sidebars light and dark before and after (Tasks 0 and 9), D8 and D9 raised for confirmation.
- **Counts:** E 10 + F 10 + G 8 = 28 (Task 4); A 21 + B 18 + D 8 = 47 (Task 3); H 22 + J 3 = 25 (Task 5); I 13 (Task 6); C 8 (Task 7). 28 + 47 + 25 + 13 + 8 = 121.
- **Known risk:** the contrast test is computed from rounded triplets; if any pair lands under its threshold, Task 1 stops and the value comes back to Charlie.
