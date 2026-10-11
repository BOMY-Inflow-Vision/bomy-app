# PR 5a — success / warning / info tokens: inventory, proposal, contrast (DESIGN PROPOSAL, no code yet)

Base: `main` at `623fc62`. For review by Charlie and Bob. **Nothing here is implemented.** The decisions in section 6 come back to Charlie before any code.

## 1. What 5a has to resolve

- Scanner: **121 deferred entries** carry the 5a follow-up (98 `R3a-palette-class`, 22 `R3b-bg-without-literal-text`, 1 `R1-button`), in **35 files** (70 web, 51 admin). 58 of them already carry a contrast warning.
- Ledger (`findings.json`): **12 deferred entries** say 5a (man-t02, t03, t08, t09, t18, t21, t26, t27, t28, t30, b9, b17). The other 37 deferred ledger entries are 5d.
- `globals.css` (web and admin, same values) has **no success, warning or info token**. Only `destructive`, `reward` (gold), `accent` (red tint) and the neutrals exist.
- The design system already defines the ramps (`docs/design-system/tokens/colors.css`, lines 57–73 and 157–168: success, warning, info = navy, danger = red; light and dark 50/100/600, light 700). They were never ported. Dark has no 700 value.

## 2. Inventory (121 entries by meaning)

| Group                                            |   n | Today                                                                                                                                 | Examples                                                                                      |
| ------------------------------------------------ | --: | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A. Status text (messages, notes, discount lines) |  21 | `text-green-600/700`, `text-amber-600/700/800`, `text-yellow-700/800`, `text-red-600`                                                 | checkout discount lines, seller subscriptions notes, "Saved." in editor, reconciliation notes |
| B. Status maps in admin tables                   |  18 | `pending: text-amber-600`, `active: text-green-600`, `expired: text-red-500`, `delivered: text-blue-600`, `cancelled: text-slate-500` | memberships, brand-subscriptions, goodie-box, stores, brand-plans, seller products badge      |
| C. Toast icons                                   |   8 | emerald-600 / blue-600 / amber-600 / red-600 (web and admin toaster)                                                                  | `toaster.tsx` ×2                                                                              |
| D. Poller status icon and tint                   |   8 | `text-green-500` on `bg-green-50`, `text-amber-500` on `bg-amber-50`                                                                  | membership success poller, brand subscribe poller                                             |
| E. Solid action buttons                          |  10 | `bg-green-600/700 text-white`, `bg-amber-500/600 text-white`, `bg-red-500/100`                                                        | mark delivered, create payout, vouchers, membership/poller CTAs, image delete                 |
| F. Membership promo page                         |  10 | amber panel, amber price, amber check marks, amber CTAs                                                                               | `membership/page.tsx`                                                                         |
| G. Decorative green panel (not a status)         |   8 | `bg-green-50` panel, `text-green-700` labels                                                                                          | product edit "add variant" form                                                               |
| H. Editor toolbars (not a status)                |  22 | `bg-gray-300` dividers, blue tint toolbar, red danger hover                                                                           | `body-editor.tsx`, `brand-story-field.tsx` (+1 raw `<button>`)                                |
| I. Shell chrome (slate)                          |  13 | `bg-slate-800/900`, `text-slate-100/300/400/500`, `border-slate-700`                                                                  | seller layout, admin sidebar, theme toggle, admin sign-in                                     |
| J. Other                                         |   3 | `bg-gray-900` video placeholder, `border-red-200` box, raw `<button>`                                                                 | youtube extension, seller-inquiry page                                                        |

Palette families: amber 41 classes, green 36, slate 29, blue 21, red 18, gray 9, yellow 4, emerald 2 (a line can hold several).

## 3. Proposed tokens

Same shape as the existing tokens (HSL triplets in `:root` and `.dark` of both `globals.css`, `hsl(var(--x))` in both `tailwind.config.ts`). Three tokens per status:

- `--success`, `--warning`, `--info`: text, icon, border and solid fill.
- `--X-foreground`: text on the solid fill.
- `--X-subtle`: tinted panel or badge background.
- Tailwind: `text-success`, `bg-success text-success-foreground`, `bg-success-subtle`; the same for `warning` and `info`. Danger stays `destructive`.

| Token                  | Light     | Dark      | Source                                                |
| ---------------------- | --------- | --------- | ----------------------------------------------------- |
| `--success`            | `#15603b` | `#4fbc85` | design system success-700 (light), success-600 (dark) |
| `--success-foreground` | `#ffffff` | `#0b1a12` | new (dark ink)                                        |
| `--success-subtle`     | `#eaf6ef` | `#10241a` | success-50                                            |
| `--warning`            | `#8e5806` | `#e0a340` | warning-700 (light), warning-600 (dark)               |
| `--warning-foreground` | `#ffffff` | `#1a1203` | new                                                   |
| `--warning-subtle`     | `#fdf4e3` | `#2b2009` | warning-50                                            |
| `--info`               | `#333e82` | `#98a2d2` | navy-600 (light), navy-300 (dark)                     |
| `--info-foreground`    | `#ffffff` | `#0c0f24` | new                                                   |
| `--info-subtle`        | `#f2f3fa` | `#171b33` | navy-50 / info-50                                     |

Why light uses the 700 level: the design system's own card pairs `success-100 / 700` as text on tint, and the 600 level fails on the 100 tint (4.14:1). The design-system warning-600 (`#b8730a`) is only 3.70–3.82:1 on the light surfaces, so it cannot carry text.

## 4. Contrast (WCAG 2.x; text needs 4.5:1, icons and graphics 3:1)

Surfaces from `globals.css`: light page `#fdfbf7`, card `#ffffff`, muted `#f7f1e9`; dark page `#17120d`, card `#1d1811`, popover `#251f18`, muted `#100d09`.

**Proposed tokens (all computed):**

| Token   | Light: worst surface | On own subtle | Solid + foreground | Dark: worst surface | On own subtle | Solid + foreground |
| ------- | -------------------: | ------------: | -----------------: | ------------------: | ------------: | -----------------: |
| success |                 6.77 |          6.84 |               7.59 |                6.88 |          6.88 |               7.57 |
| warning |                 5.28 |          5.42 |               5.92 |                7.36 |          7.22 |               8.38 |
| info    |                 8.70 |          8.82 |               9.76 |                6.55 |          6.80 |               7.60 |

All pass 4.5:1 with margin. (Subtle tints are 1.06–1.16:1 against the page on purpose: they are fills, with text of 5+:1 on top; any tinted box also keeps a `border-X/30` edge.)

**Today's classes (same class in both themes, so dark mode is not designed):**

| Class                                                     |             Light card | Dark card | Used in                        |
| --------------------------------------------------------- | ---------------------: | --------: | ------------------------------ |
| `text-green-600`                                          |                   3.30 |      5.35 | 11 uses                        |
| `text-green-700`                                          |                   5.02 |  **3.52** | 12                             |
| `text-amber-600`                                          |               **3.19** |      5.54 | 9                              |
| `text-amber-700`                                          |                   5.02 |  **3.51** | 4                              |
| `text-amber-800`                                          |                   7.09 |  **2.49** | 2 (seller subscriptions table) |
| `text-yellow-800`                                         |                   6.85 |  **2.58** | 2                              |
| `text-blue-600`                                           |                   5.17 |  **3.41** | 6                              |
| `text-red-700`                                            |                   6.47 |  **2.73** | 3                              |
| `text-green-500` / `amber-500` icons on `-50` tint        | 2.18 / 2.07 (need 3:1) |       n/a | pollers                        |
| white on `bg-green-600` / `bg-amber-600` / `bg-amber-500` |     3.30 / 3.19 / 2.15 |       n/a | CTAs                           |

So 5a is also a real dark-mode fix: several of today's status texts are 2.5–3.5:1 on the dark theme.

**Adjacent findings measured on the way (not caused by 5a):**

- Dark `destructive` button: white on `#e2635a` is **3.41:1** (fails AA). A dark foreground ink `#1a0605` gives **5.75:1**. (Light is fine: 6.12.)
- Admin sidebar: `text-slate-500` footer email on `bg-slate-800` is **3.07:1**; `text-slate-400` on the `bg-slate-700` hover is **4.04:1**. The scanner's "theme surface" warnings for the slate entries are about the wrong background; these two are the real failures.

## 5. How the proposal handles the deferred findings

| Group                     |   n | Replacement                                                                                                                                                                                                                                                                                                                           | Audit effect                                                      |
| ------------------------- | --: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| A. Status text            |  21 | `text-success`, `text-warning`, `text-destructive`; discount and "Saved" lines become `text-success`                                                                                                                                                                                                                                  | entries removed (class gone)                                      |
| B. Status maps            |  18 | `text-success` / `text-warning` / `text-destructive` / `text-info`; neutral (`cancelled`, `archived`) becomes `text-muted-foreground`; consider `Badge` variants (D)                                                                                                                                                                  | removed                                                           |
| C. Toast icons            |   8 | `text-success`, `text-info`, `text-warning`, `text-destructive`                                                                                                                                                                                                                                                                       | removed; ledger b9 stays open for its raw dismiss `<button>` (5d) |
| D. Poller icons           |   8 | success: `text-success` on `bg-success-subtle`; pending/spinner: `text-warning` on `bg-warning-subtle` (2.07 becomes 5.42 text, icons now ≥ 3:1)                                                                                                                                                                                      | removed                                                           |
| E. Solid buttons          |  10 | add `success` and `warning` variants to `Button` (`bg-success text-success-foreground hover:bg-success/90`); image delete and payout red become `variant="destructive"` / `bg-destructive/10 text-destructive`; membership/poller amber CTAs become the existing `reward` variant (gold, 6.99:1 foreground)                           | removed; white-on-colour CTAs go from 2.15–3.30 to 5.92–7.59      |
| F. Membership promo       |  10 | panel `bg-reward/10`, price `text-foreground`, check marks `text-primary`, CTAs `variant="reward"`                                                                                                                                                                                                                                    | removed                                                           |
| G. Decorative green panel |   8 | `bg-muted` panel and `text-muted-foreground` labels (the sibling edit form already uses `bg-accent`)                                                                                                                                                                                                                                  | removed                                                           |
| H. Editor toolbars        |  22 | dividers `bg-border`; table toolbar `bg-muted border-border`, label `text-muted-foreground`, active `bg-accent text-accent-foreground`; danger hover `text-destructive hover:bg-destructive/10`; "Saved" `text-success`; "Uploading" `text-muted-foreground`; the raw `TableControlButton` becomes `Button variant="ghost" size="sm"` | removed                                                           |
| I. Shell chrome           |  13 | see decision D4                                                                                                                                                                                                                                                                                                                       | removed (S1/S2) or moved to exceptions (S3)                       |
| J. Other                  |   3 | video placeholder `bg-muted`; `border-destructive/30`; raw `<button>` swap                                                                                                                                                                                                                                                            | removed                                                           |

Result: scanner **deferred 122 → 1** (the 5b provider Select) and open stays 0. Ledger: of the 12 entries, **resolve 6** (b17, t02, t03, t21, t28, t30) and **re-target 6 to 5d** (t08 and t09 accent pills; t18, t26 and t27 alert and box primitives; b9, whose colours are fixed here but whose raw dismiss `<button>` stays open), adding `man-5a2` for the remaining status-pair exceptions, giving ledger deferred 49 → **44** (49 − 6 + 1; measured after Task 8). Plain `pnpm ui:audit` still exits 1 until 5b, 5d and 5a-2 (`man-5a2`) land.

New guard: a vitest that parses both `globals.css` files and asserts the table in section 4 (≥ 4.5 text, ≥ 3 icon, both themes) so a future token edit cannot silently drop below AA.

## 6. Design decisions for Charlie (recommendation first)

- **D1 Info hue.** (a) navy, from the design system: the toast info icon and delivered status go from vivid blue to navy. (b) keep a blue. **Pick (a)**: blue is not in the brand palette.
- **D2 Amber on the membership page.** (a) gold `reward` tokens (promo = reward): panel `bg-reward/10`, CTAs `variant="reward"`, price in foreground navy. (b) brand red (`primary`). **Pick (a).** Amber stays only as the warning status colour, never as promo.
- **D3 One value per theme, light uses the 700 level.** (a) single token per status (section 3). (b) two values (600 fill, 700 text): lighter greens and ambers but a bigger token set and 600 fails on the 100 tint. **Pick (a).** Visible change: greens are deeper (`#15603b` vs `#16a34a`) and amber text is browner (`#8e5806` vs `#d97706`).
- **D4 Sidebar chrome (seller and admin).** (S1) tokenise the slate look as `--sidebar-*` and fix the two failing pairs (footer text slate-400, hover text slate-300); looks the same. (S2) move to the brand navy: `navy-900` background, `sand-50/300/400` text (sand-400 on navy-900 = 7.39, on navy-800 hover = 6.46, on navy-700 = 5.34); a visible change from cool grey to brand navy. (S3) leave as a documented exception. **Pick (S2)** if you want the shells in-brand, **(S1)** if you want zero visual change; I would show before/after screenshots of both shells before merge either way. I do not recommend (S3): it keeps the two failing pairs.
- **D5 Editor toolbars.** (a) neutral (muted and accent), not a status. (b) info tint. **Pick (a).**
- **D6 Dark destructive foreground.** Include the one-line fix (dark ink `#1a0605`, 5.75:1) in 5a? **Pick yes**: same token files, and Buttons already use it. Visible change: dark-mode destructive buttons get dark text.
- **D7 Scope split.** 5a = tokens + `Badge` variants (`success`, `warning`, `info`) + `Button` variants (`success`, `warning`) + the 121 swaps + the contrast test. Alert and box primitives (t18, t26, t27) and the accent pills (t08, t09) move to 5d. **Pick this split**: it keeps 5a to colour, not new components.

If you accept all recommendations, reply "accept all" and I write the implementation plan (tasks, tests, screenshots) for review before any code.

## 7. Visible changes to expect (all behind the decisions above)

Deeper greens and ambers in status text; navy instead of blue for info and delivered; the membership page in gold instead of amber; the product form "add variant" panel in sand instead of pale green; editor toolbars neutral; payout, mark-delivered and voucher buttons in the new success/warning variants; dark-mode status text readable; sidebar per D4. Every changed pair is checked against section 4 in both themes, and a before/after screenshot set (light, dark, 390 and 1440 px) is part of the verification.

## 8. Method and limits

Contrast computed with the WCAG 2.x formula from the exact `globals.css` surfaces and the design-system hex ramps; Tailwind v3 default palette hex for today's classes. Groups come from the deferred `reason` text and the code line; counts are per scanner entry, not per class. Not measured: hover and focus states on every control, other tinted surfaces, and APCA. The proposal does not change layout.
