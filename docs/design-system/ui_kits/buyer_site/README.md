# Buyer site UI kit

A click-through recreation of the buyer-facing surfaces of brandsofmalaysia.com, rebuilt on the BOMY design
system. Open `index.html`.

| Screen | File | Source in bomy-app |
| --- | --- | --- |
| Home | `HomeScreen.jsx.txt` | `app/page.tsx` is still a "coming soon" placeholder; this composes the real marketing copy from `app/about/page.tsx` and `(marketing)/membership/page.tsx` into the homepage the redesign calls for (intake priority #1). |
| Products catalogue | `ProductsScreen.jsx.txt` | `app/products/page.tsx` — search, category sidebar, 4-up grid, pagination. |
| Product detail | `ProductScreen.jsx.txt` | `app/products/[storeSlug]/[productSlug]/page.tsx` + `variant-picker.tsx`. |
| Brands directory | inline in `index.html` | `app/brands/page.tsx`. |
| Brand storefront | `BrandScreen.jsx.txt` | `app/brands/[slug]/page.tsx` — story, video slot, subscribe CTA, category sections. |
| Membership | `MembershipScreen.jsx.txt` | `app/(marketing)/membership/page.tsx` — copy is verbatim. |
| Cart | `CartScreen.jsx.txt` | `app/cart/page.tsx` — copy is verbatim. |
| Checkout | `CheckoutScreen.jsx.txt` | **Not in the repo** — a proposal, not a recreation. Contact → address → shipping → payment, sticky order summary, member discount line. |

Interactions that work: navigation, cart badge, category and search filtering, variant selection, add to
cart, quantity and remove, pagination, and the full checkout — shipping and payment method selection, the
card-details panel appearing only for card payment, the membership discount toggling the summary total, and
an order-placed confirmation dialog.

Sample brands and products are invented for the mock (Ah Huat Roasters, Nyonya Pantry, …) — the live
catalogue is not public. All image slots are placeholders; the product needs real photography.
