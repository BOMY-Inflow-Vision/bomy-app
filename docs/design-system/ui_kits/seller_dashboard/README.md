# Seller dashboard UI kit

A click-through recreation of the seller surfaces, rebuilt on the BOMY design system. Open `index.html`.

| Screen | File | Source in bomy-app |
| --- | --- | --- |
| Shell / rail | `SellerSidebar` component | `app/seller/dashboard/layout.tsx` — Overview, Subscriptions, Products, Orders, Settings. |
| Overview | `OverviewScreen.jsx.txt` | `app/seller/dashboard/page.tsx` — store header with status, plus the payout/orders/products/subscribers stats the dashboard is growing into. |
| Products | `ProductsScreen.jsx.txt` | `app/seller/dashboard/products/page.tsx` — status filter pills and the products table, verbatim columns. |
| Orders | `OrdersScreen.jsx.txt` | `app/seller/dashboard/orders/page.tsx` — status filters and the order rows with seller payout. |

Subscriptions and Settings exist upstream but were not recreated; the kit says so in place rather than
inventing a design for them.

Money shown is illustrative. Upstream, commission is `(gross − PSP fee) × rate` — 25% on orders, 10% on brand
subscriptions — and all amounts are bigint sen.
