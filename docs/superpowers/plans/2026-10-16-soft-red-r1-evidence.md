# Soft-red R1: evidence for the plan gates

Evidence for Bob's three gates on R1 (branch `feat/soft-red-r1-tokens-fonts`). Measured on local dev with the seeded seller, final palette (near-white ground). Temporary routes under `apps/web/src/app/zz-harness/` were used and are not in the diff.

## D1b: every destructive-colour use, by surface and state

All 49 source lines (24 files, excluding one comment) that use the destructive colour in `apps/web/src` and `packages/ui/src` fall into five groups. Each group shares one class recipe, so one measurement covers every member. "Surfaces" are the ones the members sit on in source (page ground, card, muted); the harness measured every group on all three, in light and dark, at 390, 767 and 1440 px.

| Group                       | Recipe                                                                                                                                                 | Members (file:line)                                                                                                                                                                                                                                               | States                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| G1 Form error banner        | `rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive` (also `Alert variant="destructive"`, `border-destructive/20` variant in body-editor) | seller/apply/page.tsx:139; seller settings-form.tsx:137,183,241,286; seller product-form.tsx:119; image-manager.tsx:228; product-edit-form.tsx:468; auth magic-link-form.tsx:91; provider-apply-form.tsx:86; body-editor.tsx:458; checkout \_form.tsx:440 (Alert) | rest                                         |
| G2 Inline error text        | `text-sm` or `text-xs` plus `text-destructive`                                                                                                         | sign-in page.tsx:101; mark-delivered:48; enter-tracking:93; provider-apply-form.tsx:23; checkout \_form.tsx:261,441,476; name-editor:99; address-manager:210,281,318; confirm-delivery:47; body-editor.tsx:447; variant-picker.tsx:130 (out of stock)             | rest                                         |
| G3 Field error border       | `border-destructive focus-visible:ring-destructive` on `Input`/`Select`                                                                                | checkout \_form.tsx:329,343,356,369,383,399,412                                                                                                                                                                                                                   | rest, focus                                  |
| G4 Outline and text buttons | `text-destructive` with `hover:bg-destructive/10` (and `border-destructive/30\|50`, `active:bg-destructive/20` on one)                                 | product-edit-form.tsx:440,702; product-new product-form.tsx:335; membership/manage/page.tsx:102; cart/page.tsx:125; address-manager.tsx:151; body-editor.tsx:764                                                                                                  | rest, hover, active (membership button only) |
| G5 Solid and subtle         | `Button variant="destructive"`, `Badge variant="destructive"`, `Badge variant="destructive-subtle"`, toast error icon                                  | image-manager.tsx:83; subscriptions/page.tsx:103; lib/status-badge.ts:16 (suspended); toaster.tsx:81                                                                                                                                                              | rest, hover (`brightness-90`)                |

### Browser evidence (harness gallery, every group on background, card and muted)

- Worst text contrast at rest: **5.45:1 light, 5.16:1 dark** (banner on muted / banner on card). Required 4.5.
- Field-error border against its surface: 6.92 / 7.26 / 6.44 (light: background / card / muted) and 6.24 / 5.92 / 6.50 (dark). Required 3.
- Hover (1440 px, on the page ground): outline button 5.48 light / 7.44 dark; text button 5.84 / 5.50; membership button 5.84 / 5.50.
- Active (membership button, the only `active:bg-destructive/20` use): 4.88 light, 4.66 dark.
- Real toast: the error toast was opened through the real `useToast` (red icon, card ground) at 1440 px light and dark and looked right in the screenshot.
- Screenshots: `.playwright-mcp/r1e-destructive-{light,dark}-{390,767,1440}.png`.

### Token-test evidence (source, runs in CI)

`apps/web/tests/design-tokens/soft-red.test.ts`: destructive differs from primary (distance at least 0.15); `border-destructive` at least 3:1 and text on its `/10` hover tint at least 4.5:1 on every surface; the `/20` active tint at least 4.5:1 on the page ground (the only surface that button uses); solid destructive foreground at least 4.5:1. Existing `status-pairs.test.ts` and `contrast.test.ts` still pass.

### Finding fixed by this gate

The first per-state test showed the dark destructive text failing 4.5:1 on its own `/20` active tint (4.22:1 on the page ground). This existed before R1 (dark destructive was unchanged). R1 lifts the dark `--destructive` from `4 70% 62%` to `4 70% 66%`, which passes. The light `/20` tint also fails on the `accent` surface (4.30:1), but no member uses it there, so the test does not require it.

### Not browser-checked (source and token-test evidence only)

Each member in G1 to G5 not rendered on its real page: they use the same class recipe as the harness, which the harness rendered with the real `Button`, `Badge`, `Alert`, `Input` components and the real toaster. Real pages that were loaded and text-checked in both themes are listed in the next section. Real error states that need a failing server action (seller settings error, checkout address validation, upload failure) were not triggered.

## The real paused /checkout panel (final palette)

Checkout stays off. `/checkout` as shipped, light and dark, at 390, 767 and 1440 px (6 views): the dashed `border-input` border measures **4.40:1 light and 4.13:1 dark** against the page ground, panel text 14.2:1 light and 18.8:1 dark. The panel is visible and not harsh (`.playwright-mcp/r1g-checkout-{light,dark}-{390,767,1440}.png`). The blank checkout form fields were measured earlier through a temporary route that rendered the real `CheckoutForm`: border 4.40:1 light, 4.13:1 dark, at 390 and 1440 px (7 fields).

## 767 px and text contrast on real pages

17 pages, light and dark, at 390, 767 and 1440 px (102 views, all HTTP 200 in the dark run; the light run did not record statuses). Pages: `/products`, `/brands`, `/auth/sign-in`, `/cart`, `/checkout`, `/about`, `/membership`, `/privacy`, `/contact`, a product detail page, seller dashboard, seller products, seller settings, seller product edit, `/account`, `/account/addresses`, `/account/orders`. Signed in as the seeded seller. Text contrast was measured with real alpha compositing (semi-transparent tints included), skipping hidden, disabled and `aria-hidden` text.

- **0 text nodes below 4.5:1** (3:1 for large text) and **0 pages with horizontal scroll** in either theme.
- Correction: the earlier PR draft said text was measured "against the nearest opaque background". That first pass ignored alpha. It was replaced by this run.

## Long names, BM and ZH text: R1 against the old code

Stress test, not real data: on 14 pages, text of every heading, link, paragraph, table cell and label under 80 characters had one of three suffixes appended: a long English name ending in an 80-character unbreakable token, a Malay phrase with a 50-character unbreakable token, and 50 Chinese characters with no spaces. 168 page loads per run (14 pages x 4 variants x 3 widths). The same script ran on the **old tokens and fonts** (Plus Jakarta Sans) and on R1 (Geist / Bricolage), and the two result sets were compared line by line.

- **No baseline page (no injected text) overflows** at 390, 767 or 1440 px with either set of fonts.
- Unbreakable English and Malay tokens overflow horizontally on many pages at 390 px (for example `/brands` 120 elements, `/about` 14, product detail 12), and the Chinese suffix wraps correctly on most pages. **This is the same with the old code.**
- **R1 changes 2 of 168 results, both for the better:** seller product edit at 390 px with the Malay suffix (8 overflowing elements before, 6 after), and `/cart` at 1440 px with the English suffix (2 before, 0 after). The other 166 results are identical.
- Clipped (not ellipsis) text: 0 in both runs, after excluding screen-reader-only text.
- Chinese text is not in Geist or Bricolage (we load the latin subset). It renders in the system fallback font from the Tailwind sans stack, and wraps without clipping (`.playwright-mcp/r1f-zh-390-_products.png`). The weight and glyph shapes differ from the Latin text, as expected.
- **Follow-up, not fixed in R1:** unbreakable tokens of 50 or more characters overflow on `/brands`, `/about`, product detail and seller pages. It is an existing layout weakness (no `break-words` or `min-w-0`). R4 and R5 own those layouts and should add wrapping and a test with a long name.

Not evaluated: real long product names from real sellers, dark-mode overflow (layout does not depend on the theme, so only light was run for overflow), Firefox, Safari.
