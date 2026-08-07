# Handoff: BOMY Design System → bomy-app (Next.js)

## Overview
This bundle applies the BOMY design system to the live `BOMY-Inflow-Vision/bomy-app` monorepo (`apps/web` buyer/seller Next.js app, `apps/admin` ops console). `apps/web` currently ships the default shadcn/ui theme (indigo primary, Inter font) — none of it is BOMY-branded yet. This handoff retheme's that app to the real BOMY tokens and specifies which screens to rebuild.

## About the files in this bundle
Everything under `tokens/`, `components/`, `guidelines/`, and `ui_kits/` is a **design reference**, not code to import into the app. It's plain HTML/React with inline styles and CSS custom properties — it does not use Tailwind or the `bomy-app` CVA component pattern. Open `ui_kits/buyer_site/index.html` or `ui_kits/seller_dashboard/index.html` directly in a browser — both are self-contained click-through prototypes. `guidelines/*.card.html` are token/foundation specimens (colors, type, spacing, icons).

**The task**: recreate these designs inside `bomy-app`'s existing stack (Next.js 15, Tailwind 3, shadcn/ui + Radix + CVA), reusing its component patterns — not copying the HTML/inline-style source verbatim.

## Fidelity
**Hi-fi.** Token values (color, type, radius, spacing) are final — use the exact values below, **with one exception: the brand red is not yet confirmed, see §5.** Component visuals (states, sizing, copy) in `components/*/*.jsx.txt` and `ui_kits/**` are final reference; re-implement them with Tailwind classes bound to the retheme'd CSS variables, following each existing shadcn file's structure (`cva` variants, `forwardRef`, etc).

## 1. Retheme `apps/web/src/app/globals.css` (and `apps/admin` equivalent)
Replace the `:root` block's color variables with BOMY's tokens (converted to shadcn's `H S% L%` HSL-triplet format). Source values are in `tokens/colors.css`.

```css
:root {
  --background: 40 60% 98%;        /* sand-50 */
  --foreground: 231 49% 15%;       /* navy-900 */
  --card: 0 0% 100%;
  --card-foreground: 231 49% 15%;
  --popover: 0 0% 100%;
  --popover-foreground: 231 49% 15%;
  --primary: 4 71% 43%;            /* red-600 */
  --primary-foreground: 0 0% 100%;
  --secondary: 37 45% 94%;         /* sand-100 */
  --secondary-foreground: 231 49% 15%;
  --muted: 37 45% 94%;             /* sand-100 */
  --muted-foreground: 34 19% 36%;  /* sand-600 */
  --accent: 5 73% 97%;             /* red-50 */
  --accent-foreground: 4 71% 43%;  /* red-600 */
  --destructive: 4 71% 43%;        /* red-600 — see note below */
  --destructive-foreground: 0 0% 100%;
  --border: 35 30% 81%;            /* sand-300 */
  --input: 35 30% 81%;             /* sand-300 */
  --ring: 4 64% 51%;               /* red-500 */
  --radius: 0.625rem;              /* was 0.5rem */
}
```
Values are computed from the source hexes in `tokens/colors.css` — spot-check with a color tool before shipping. The `.dark` block can be ported the same way from the `.dark` section of `tokens/colors.css` if/when dark mode ships (not wired up in `bomy-app` today).

**Flag for the team:** BOMY's `--destructive` and `--primary` are the same red (the brand color doubles as the danger color in the source system). If destructive actions need to read as distinct from primary CTAs, consider `red-700`/`red-800` for destructive instead — confirm with whoever owns the design system before deviating.

Delete or repurpose the unused `bomy` orange scale in `apps/web/tailwind.config.ts` — it's stock shadcn boilerplate, not BOMY's brand color, and nothing in the app references it yet.

## 2. Fonts
`apps/web/src/app/layout.tsx` currently loads `Inter` via `next/font/google` as `--font-sans`. Switch to:
- `--font-sans` / `--font-display`: **Plus Jakarta Sans** (weights 400/500/600/700/800)
- `--font-mono`: **IBM Plex Mono** (400) — not currently loaded at all; add it if any UI needs tabular/mono text (order IDs, SKUs).

Both are on Google Fonts — swap the `next/font/google` import the same way `Inter` is wired today. See `tokens/typography.css` for the full scale (12/13/14/16/18/20/24/30/36/48/60) and semantic type roles (`--type-h1`, `--type-body`, etc.) to carry over as Tailwind `fontSize`/`lineHeight` utilities or a small set of text-style classes.

## 3. Component mapping
| BOMY component | `apps/web/src/components/*` today | What changes |
| --- | --- | --- |
| Button | `ui/button.tsx` | Add `reward` variant (gold, for membership CTAs); `outline`/`ghost`/`link` keep shape, recolor via retheme. See `components/core/Button.jsx.txt` for hover/press/disabled/loading states. |
| Card | `ui/card.tsx` | Recolors via retheme only; radius becomes `--radius-card` (0.75rem). |
| Badge | `ui/badge.tsx` | BOMY has `StatusPill`/`StockStatus` (commerce-specific semantics: in stock / low stock / preorder / order states) layered on top of the generic badge — see `components/commerce/StatusPill.jsx.txt`, `StockStatus.jsx.txt`. |
| Input, Label, Textarea | `ui/input.tsx`, `ui/label.tsx`, `ui/textarea.tsx` | Recolor + radius only. |
| **Select, Checkbox, RadioGroup, Switch, Field** | *not in repo yet* | New — build on Radix primitives (already a dependency) per `components/forms/*.jsx.txt` + `*.prompt.md`. `Field` is the label+control+help/error wrapper other forms compose from. |
| **Dialog** | *not in repo yet* | New — core, used for order-placed confirmation, delete confirmations, etc. Build on `@radix-ui/react-dialog`. |
| **Toast** | *not in repo yet* | Deprioritize — BOMY's system marks toast as discouraged in favor of inline confirmation (a message rendered in-place, not a transient overlay). Only add if a genuinely async/global event needs it (e.g. background job finished). |
| **EmptyState, DataTable** | *not in repo yet* | New — `DataTable` is for the seller dashboard (orders, products); `EmptyState` for empty cart/orders/products lists. |
| NavBar, Footer | `nav-bar.tsx`, `footer.tsx` (note: **not** under `ui/` — one level up, at `components/nav-bar.tsx`/`footer.tsx`) | Recolor + restyle per `components/navigation/NavBar.jsx.txt` / `Footer.jsx.txt`; logic (mobile menu, cart badge, auth links) in the current file is solid and can stay — just retheme classNames. |

Every component in `components/` has a sibling `.prompt.md` describing intended props, variants, and behavior — read that alongside the `.jsx.txt` before implementing.

## 4. Screens to rebuild
Each UI kit README maps every screen to its exact `bomy-app` source file:
- `ui_kits/buyer_site/README.md` — Home, Products catalogue, Product detail, Brands directory, Brand storefront, Membership, Cart, Checkout.
- `ui_kits/seller_dashboard/README.md` — Overview, Products, Orders.

Two things called out there worth repeating:
- **Home** (`app/page.tsx`) is currently a placeholder — `HomeScreen.jsx.txt` composes real marketing copy already in the repo (`about/page.tsx`, `(marketing)/membership/page.tsx`) into the homepage this redesign implies. Confirm that's the intended direction before building it.
- **Checkout** UI doesn't exist in the repo yet (`app/checkout/_form.tsx` is unstyled/default). `CheckoutScreen.jsx.txt`'s flow (contact → address → shipping → payment, sticky summary, member discount) is a **proposal**, including its business rules (5% member discount, multi-parcel shipping note) — confirm those rules against `app/checkout/actions.ts` / `queries.ts` before shipping; don't assume the mock's math is authoritative.

## 5. Open items / do not guess
- **No logo file exists.** Ship the wordmark-only lockup in `components/navigation/Wordmark.jsx.txt` until a logo is provided.
- **Fonts** are wired via Google Fonts CDN in the mock; if the team has licensed static font files, swap to `next/font/local` instead.
- **Product photography and the "egg" avatar illustration are placeholders** everywhere (image slots) — swap in real assets when available, don't ship placeholder art to production.
- **Red warmth**: the brand red (`--red-600 #b92b20`) has not been confirmed as final — check with the design owner before treating it as locked.

## Files in this bundle
```
tokens/            8 CSS files — colors, type, spacing, radius, elevation, motion, fonts, base
styles.css         imports all of tokens/
components/        35 components (core, commerce, forms, feedback, data, navigation), each with .jsx.txt + .d.ts.txt + .prompt.md
guidelines/        17 specimen pages (color ramps, type scale, spacing, icons, elevation, motion)
ui_kits/
  buyer_site/      Home, Products, Product, Brand, Membership, Cart, Checkout — open index.html
  seller_dashboard/ Overview, Products, Orders — open index.html
_ds_bundle.js      compiled component bundle the ui_kits/guidelines HTML files load — reference only, do not ship
```
