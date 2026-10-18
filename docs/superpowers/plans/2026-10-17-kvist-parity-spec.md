# Kvist layout and motion parity spec (for BOMY soft-red R2 to R6)

Charlie's request (2026-10-17): follow the layout of https://demo.codeandchill.store/kvist/ "near to identical", including the cart with the counter beside it (no overlap), scroll smoothness and animation. Do not copy image, text or logo.

## Honesty boundary

- We measured the demo in a browser. We did NOT copy its files, text, images or logo.
- BOMY builds every piece itself: own components, own class names, own copy, own logo mark.
- Smooth scroll uses Lenis (`lenis`, MIT licence, open source). It is a normal npm package, not Kvist code.
- Fonts stay Bricolage Grotesque, Geist, Geist Mono (all OFL, already shipped in R1).

## Measured facts (1440 px unless noted)

### Smooth scroll

- `<html class="lenis">`. One 400 px wheel notch moves about 800 px and settles in about 1.2 s with an exponential ease-out.
- BOMY: Lenis with `lerp` near 0.1, `wheelMultiplier` 2. Off when `prefers-reduced-motion: reduce`. Off inside dialogs and menus that scroll themselves.

### Header

- Fixed wrapper: `inset-x-0 top-0 z-40`, side padding 12 px (mobile) and 20 px (desktop), top 16 px. Total height 80 px.
- Pill: full width of the page column (x 20 to 1420), height 64 px, fully round, `backdrop-blur 12px`.
- Pill background is translucent: alpha 0.7 at the top of the page, 0.95 after scroll. Transition 300 ms `cubic-bezier(0.4,0,0.2,1)` on background and shadow.
- Left: round logo mark and wordmark (94 px wide) at x=40.
- Centre: five links, 14 px, weight 500, 37 px tall, 4 px apart. Colour is muted. Hover changes colour and a soft background in 150 ms.
- Right: account icon (44x44) then a dark pill button "Bag" (112x48) with a round counter badge INSIDE the button, to the right of the label. No overlap.
- Mobile (390 px): pill from x=12, logo left; right side shows account icon, a dark pill with cart icon and round counter beside it, then a hamburger.

### Page frame

- Side padding 20 px desktop, 12 px mobile. Warm ground. Hero starts at y=96 (desktop) and 88 (mobile).
- Cards: radius 28 px, 16 px gaps, 1 px soft shadow `rgba(28,27,24,0.04)`.

### Type

- h1: 95 px, weight 650, tracking -3.3 px, line height 0.95. h2: 72 px, weight 650, tracking -2.5 px, line height 0.95. Mobile steps down (h1 about 44 px).
- Product title 17 px, weight 500. Mono eyebrows 11 px, tracking 0.16em, upper case.

### Sections, in order

1. Hero bento: big white card (headline, copy, two buttons, avatar stack with rating) + tall pastel product card (mono label, title, rotating circular-text badge, big image, price bar with "Details" and "Add to bag") + pastel link tile + delivery tile with dotted track and a round badge that travels on it.
2. Marquee band: huge bold words separated by round accent dots, scrolling sideways forever.
3. "Find your corner" browse bento: one large card (2 pieces) + four small pastel tiles in a 2x2, each with a round arrow button. Heading row has "All products" with a round arrow.
4. "This week's favourites": filter pills in a rounded tray (active = dark), 4x2 product grid. Tile 338x505, tall pastel art area, badge ("Bestseller", "New"), soft ground shadow under product, category label, name, price, rating row.
5. "Buy once, keep for good": two big cards. Left card has a statement whose words fade from grey to dark as you scroll (scroll-linked word reveal) and three stats. Right card is a photo with a glass product chip.
6. Stats row: four tiles 338x260.
7. Testimonials: three figures.
8. Newsletter: dark card with photo on the right, input and button.
9. Footer: dark rounded card (radius about 40 px). Left tagline and copy, two link columns with mono labels, a giant wordmark cropped at the bottom edge, a divider and a small copyright row.

### Not yet measured (measure before the slice that needs it)

- Scroll-reveal: which elements fade or rise in, distance, duration, stagger.
- Card hover: lift, image scale, arrow button motion.
- Mobile menu: open animation and panel shape.
- Rotating badge speed, truck track speed, marquee speed.
- Counter animation (stats) and the word-reveal trigger range.

## Mapping to BOMY slices

| Slice          | What changes                                                                                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R2 nav         | Full-width fixed pill (20 px / 12 px gutters), `--nav-height` 4rem, blur, alpha 0.7 to 0.95 on scroll, centred links, account icon, dark "Cart" pill with inline round counter. Keep the label "Cart" (not "Bag") and keep all current menu, keyboard and aria behaviour. |
| R2 footer      | Dark rounded card, mono labels, giant cropped BOMY wordmark, legal text unchanged and test-pinned.                                                                                                                                                                        |
| R2 motion base | Lenis provider (new tiny client component), reduced-motion off switch, scroll-state hook for the nav alpha.                                                                                                                                                               |
| R3 home        | Hero bento, marquee, browse bento, favourites with filter pills, promise cards, stats, testimonials, newsletter. Needs Charlie-approved copy and real data rules (no fake ratings or counts).                                                                             |
| R4             | ProductCard in the favourites tile shape, filter-pill, pastel tile tokens, long-name wrapping test.                                                                                                                                                                       |
| R6             | Reveal, hover, marquee, rotating badge, word reveal, counters, all with reduced-motion fallbacks.                                                                                                                                                                         |

## Rules that keep it safe

- Every motion has a `prefers-reduced-motion` fallback (no motion, final state shown).
- No layout shift: reveal uses transform and opacity only.
- Marquee and rotating badge pause for reduced motion and are `aria-hidden` when decorative.
- No fake data: no invented ratings, review counts or "homes" numbers. Show only real values or leave the element out.
- Contrast gates from R1 still apply to every new pastel tile and to text on the translucent pill (measure at alpha 0.7 over the busiest content).
