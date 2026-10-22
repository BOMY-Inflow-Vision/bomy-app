# Soft-red R3 home page: evidence

Branch `feat/soft-red-r3-home`, 2026-10-22. Copy state: **DRAFT** (`HOME_COPY_STATUS = "draft"`). The PR does not merge until Charlie approves the words in `apps/web/src/app/_home/home-copy.ts` and the full DB-environment suite has zero failures.

## 1. What changed

- New `apps/web/src/app/_home/`: `home-copy.ts` (every R3-owned word), `home-types.ts`, `home-queries.ts` (public reads only), `hero.tsx`, `marquee.tsx`, `browse.tsx`, `favourites.tsx`, `promise.tsx`, `stats.tsx`, `sellers.tsx`, `cta.tsx`.
- `apps/web/src/app/page.tsx` replaced: composition, `generateMetadata` from the copy file, `export const dynamic = "force-dynamic"`, one `main`.
- `apps/web/tailwind.config.ts`: two font sizes, `text-display` and `text-display-sm` (line height 0.95, tight tracking).
- Tests: `tests/home/*` (copy, queries unit, queries on real rows, hero, marquee and browse, favourites, sections, page) and `tests/design-tokens/display-type.test.ts`.
- Decisions D1a to D5a (Charlie): pills are plain links to `/products?category=<id>`; "From our sellers" (real brand cards) and a "Sell with us / Become a member" card replace testimonials and the newsletter; static finals (motion is R6); hero art is BOMY-drawn shapes plus the newest real product cover; stats are three real counts.
- Recorded choice (Task 3): the hero and CTA buttons are plain styled links, not `@bomy/ui` `Button`, because `Button` has `whitespace-nowrap` (see section 5).

Commits (after the plan commits): `8a9cc65` copy file and tests, `b3ca7b2` queries, `6fa17cf` tokens and hero, `1d2d978` marquee and browse, `f0aa9e0` favourites, `f9efc42` four sections, `aab3b2c` page, `2cf9982` hero order fix (found in the browser, see section 3).

## 2. Build

`pnpm build` with `DATABASE_URL`, `DATABASE_APP_URL` and `.env.local` removed from the build: exit 0, `/` listed as `ƒ` (server-rendered on demand). `loading.tsx` under `products/` was moved aside for the standalone recipe and restored (the file is untracked and unchanged).

## 3. Browser pass (standalone build, `bomy_app` role, fixtures `r3fx`)

Server: `apps/web/.next/standalone`, `DATABASE_APP_URL` set to the `bomy_app` role so public reads ran under RLS. Fixtures (owner SQL, no `withAdmin`): 3 stores (one with an 80-character unbroken name), 15 categories (one with an 80-character name), 31 products (long names, no cover, failing cover on the featured product, one with no variants so no price, one sold out). All removed afterwards.

Five widths (1440, 1024, 768, 390, 320), light and dark, ten page loads each (100 loads per pass). Same script for every pass: `.playwright-mcp/r3-measure.js`.

Final pass on the committed code (normal copy), 10 of 10 scenarios identical on every pass/fail line:

| Check                                                             | Result at all 5 widths, both themes                                                                                                             |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Page `scrollWidth` equals viewport                                | yes (1440, 1024, 768, 390, 320)                                                                                                                 |
| Section order (16 markers)                                        | matches the visibility table                                                                                                                    |
| `main` count, `h1` count                                          | 1 and 1                                                                                                                                         |
| Contrast, every text element composited over its real backgrounds | lowest 5.21 (light), 5.10 (dark); 0 below 4.5                                                                                                   |
| R3 text outside its tile or clipped by a clipping ancestor        | 0                                                                                                                                               |
| Tab order                                                         | nav, hero headline buttons, featured card, themed tile, browse, pills, product cards, promise chip, brand cards, CTA, footer (equals DOM order) |
| Focus ring (2 px) and ring clipping on every focusable in `main`  | 0 issues                                                                                                                                        |
| Console errors                                                    | 0, apart from the intentional failing cover fixture (`img.invalid`, one per page load)                                                          |
| Reduced motion (emulated at 1024 light)                           | no difference (nothing moves)                                                                                                                   |

Text on the decorative tint circle (not an ancestor, so not in the script): foreground 12.33 / muted foreground 5.20 (light), 15.14 / 6.84 (dark), computed from the tokens.

Found in the browser and fixed (`2cf9982`): the tall featured card rendered in the first column although it comes second in the DOM, so visual order and Tab order differed. It now has `lg:col-start-3`, pinned by a test.

Measurement rules that changed during the pass (disclosed): the first run reported 15 "scrollHeight" and "outside tile" lines per scenario. They were caused by `line-height: 0.95` (the inline content area is a few pixels taller than the line box; nothing is clipped, no ancestor clips it). The rule now counts a scroll overflow only on an element that itself clips, takes tile containment vertically from the line box, and checks every clipping ancestor against the text's own rectangle (that check never failed). A later fix compared hero buttons with themselves; corrected before the stress and final passes.

## 4. Three-times-longer copy (Review Focus 4)

Temporary local edit: every string value in `home-copy.ts` repeated three times, built with `pnpm build`, served, measured with the same script, screenshots at 1440 and 390 (`.andy/r3-shots/r3-stress-*.png`). Result at all 10 scenarios: 0 violations; page width equals the viewport; hero, headline, themed, delivery, browse, promise, stats and CTA text stays inside its tile; buttons wrap to two lines instead of clipping; the hero card grows; the lowest margin of any R3 text to its tile is 0 px (never negative); clip slack to the nearest clipping ancestor is at least 17 px. The featured product's real name clamps to two lines by design (`line-clamp-2`).

Restore proof: `shasum` of `home-copy.ts` is `fae3c8a65f027c2fcf0c871abc47bab72bfafe4d`, identical to `git show HEAD:...`, and `git diff HEAD` is empty (0 lines, 0 files) before any further commit. The final pass ran on a rebuild of the committed copy.

## 5. Not evaluated, with reasons

- **Empty page in the browser and "one of everything" in the browser:** not evaluated. The isolated empty database (plan layer 3) was not provisioned. The empty page is proved by the mocked-data page test (exact marker list; no "0"; no empty section, form or input). One product, one brand, one category are proved by the section tests.
- Per-fixture visible text in the browser (the "Sold out" badge, the missing price line on the variants-less product, the Package fallback on a product with no cover) was not asserted one by one in the browser; those rules are asserted by the unit tests. The browser pass covered overflow, containment, contrast and focus with those fixtures present.
- Real product photos (fixtures used inline SVG covers and one unreachable URL).
- Admin tests without the DB environment: 251 passed, 110 skipped (not evaluated). Admin was not run with the DB environment (nothing in admin changed).
- The extreme-price `@bomy/ui` Button clip stays a separate fix; this page uses its own links.

## 6. Gates

- `pnpm typecheck` 0, `pnpm lint` 0, `ui:audit --allow-deferred` exit 0 (92 covered, 0 open), `ui:audit:test` 17 of 17.
- **Web suite, DB environment** (preflight `check-integration-env.mjs` passed; `DATABASE_URL`, `DATABASE_APP_URL` as `bomy_app`, `BOMY_RLS_READY=1`, `REDIS_URL`): 1480 passed, **1 failed**, 0 skipped, every file loaded. The one failure, from the JSON report: `tests/home/home-copy.test.ts` "home copy: merge gate is approved by Charlie before the PR merges (fails while the copy is a draft)". `home-queries.db.test.ts` 6 of 6 (it ran; not skipped), `home-queries.test.ts` 5 of 5, all 11 `tests/storefront` files 152 of 152.
- Web suite, no DB environment (reported separately): 1138 passed, 1 failed (the same gate), 295 skipped (not evaluated); `tests/auth/magic-link-actions.test.ts` and `tests/auth/consent/actions.test.ts` could not load without `DATABASE_URL` (not evaluated there, passed in the DB run).
- After Charlie's approving commit (`HOME_COPY_STATUS = "approved"`) the DB-environment suite must show zero failures.

## 7. Local data, audit rows, `checkout_enabled`

- Ports 3000, 3001 and 3002 were free before and after; no `apps/api` or `apps/admin` process ran (`lsof`, `ps`).
- **Audit rows attributed to R3: 0.** `admin_bypass_audit` total 238328 and newest row `2026-10-21 13:38:03.299054+00` before and after about 500 page loads in the browser passes (five passes of 100) plus three single-load checks with nothing else running (before and after identical, three repeats), plus screenshot loads. Source: `.andy/r3-audit-window-start.txt`, `r3-audit-single-load.txt`, `r3-audit-window-end.txt`. The home page and its fixtures wrote nothing.
- Fixtures: removed; `stores`, `products`, `product_variants` and `categories` counts equal the pre-pass baseline (zero `r3fx` rows; all baseline tables identical).
- DB suite run (start `2026-10-22 10:11:33 UTC`): +560 `admin_bypass_audit` rows, every one with a non-null actor and a test or app-under-test reason (for example "test seed", "test cleanup", "read checkout_enabled gate", "seed order"); none from the home page. The null-actor count is unchanged (3885). Append-only: they stay.
- Suite residue: 93 users created. 76 deleted (no dependents, not audit actors; their consents went with them, `user_consents` is back to 1589). **17 retained**: 16 are `admin_bypass_audit.actor_user_id` (the foreign key is ON DELETE SET NULL, so deleting would blank append-only audit rows), 1 is linked by another table. `action_rate_limits` +2. **Charlie must accept these retained local rows explicitly.**
- `checkout_enabled` is `false`, `updated_at` `2026-05-28 03:21:59.449+00`, `updated_by` unchanged.
- `bomy-check` (the script `infra/docker/sync-check.sh`): the database differs from the last export, as it has for many sessions (many tables, including rows from earlier work). No export was run. Whether to export depends on whether Charlie switches machines.

## 8. Diff proof

Against `main` (`901885a`, merge base): 25 files changed, 2139 insertions, 4 deletions. Forbidden paths (`apps/web/src/lib/**`, `auth.ts`, `auth.config.ts`, `middleware.ts`, `checkout/**`, `products/**`, `brands/**`, `nav-bar.tsx`, `footer.tsx`, `packages/**`, `apps/admin/**`, `apps/api/**`): 0 files. No `package.json`, lockfile, migration, schema, env or turbo change. Files outside `_home/` and `tests/home/`: `page.tsx`, `tailwind.config.ts` (+11 lines, the two font sizes), `tests/design-tokens/display-type.test.ts`, and the plan. The four deleted lines are the old placeholder page (`export default function Home()`, its `main` and the two text lines).

## 9. For Charlie and Bob

- The words in `home-copy.ts` are draft. Please approve or rewrite them; your approving commit sets `HOME_COPY_STATUS = "approved"` and carries no Co-Authored-By line.
- Two headings read alike ("Fresh from our sellers" over the products, "From our sellers" over the brands); this is a wording question for you.
- The statement "We pick sellers one at a time" rests on the locked brand-vetting decision; please confirm it.
- Marquee, rotating badge, word reveal and counters stay for R6.
