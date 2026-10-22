// R3 Task 2, layer 2 (required gate: this file must RUN, not skip): getHomeData against real rows.
// Fixtures go in as the table owner (marker r3fx) so no audit row is written and no user is created;
// the reads go through the app role under public read. Every expected value is computed by an
// independent raw-SQL query over the same database, so the test does not depend on what else is in it.
import { makeDb } from "@bomy/db"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { getHomeData, getFeatured, getCategoriesWithCounts } from "@/app/_home/home-queries"
import { getProducts } from "@/app/products/queries"

const OWNER_URL = process.env["DATABASE_URL"]
const shouldRun =
  Boolean(OWNER_URL) &&
  Boolean(process.env["DATABASE_APP_URL"]) &&
  process.env["BOMY_RLS_READY"] === "1"

type IdRow = { id: string }
type NRow = { n: number }
type CountRow = { id: string; n: number }

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000001"

describe.skipIf(!shouldRun)("getHomeData (real rows, public read)", () => {
  let owner: ReturnType<typeof makeDb>
  const ids: Record<string, string> = {}

  beforeAll(async () => {
    owner = makeDb({ url: OWNER_URL as string })
    const q = owner.sql
    const [a] = await q<
      IdRow[]
    >`insert into stores (owner_id, name, slug, status) values (${SYSTEM_ACTOR}, 'R3FX Store A', 'r3fx-a', 'active') returning id`
    const [b] = await q<
      IdRow[]
    >`insert into stores (owner_id, name, slug, status) values (${SYSTEM_ACTOR}, 'R3FX Store B', 'r3fx-b', 'active') returning id`
    const [c] = await q<
      IdRow[]
    >`insert into stores (owner_id, name, slug, status) values (${SYSTEM_ACTOR}, 'R3FX Store C pending', 'r3fx-c', 'pending') returning id`
    const [x] = await q<
      IdRow[]
    >`insert into categories (name, slug, is_active) values ('R3FX Cat X', 'r3fx-cat-x', true) returning id`
    const [y] = await q<
      IdRow[]
    >`insert into categories (name, slug, is_active) values ('R3FX Cat Y (no active product)', 'r3fx-cat-y', true) returning id`
    const [z] = await q<
      IdRow[]
    >`insert into categories (name, slug, is_active) values ('R3FX Cat Z inactive', 'r3fx-cat-z', false) returning id`
    ids["a"] = a!["id"]
    ids["b"] = b!["id"]
    ids["c"] = c!["id"]
    ids["x"] = x!["id"]
    ids["y"] = y!["id"]
    ids["z"] = z!["id"]

    // 25 newer products with no cover: they fill the first 20-row page of getProducts.
    for (let i = 0; i < 25; i++) {
      await q`insert into products (store_id, name, slug, status, category_id, created_at)
        values (${ids["a"]}, ${"r3fx nocover " + i}, ${"r3fx-nocover-" + i}, 'active', ${ids["x"]}, now() + interval '1 day')`
    }
    // Newer still, but unusable as featured: an empty cover, a pending store, a draft.
    await q`insert into products (store_id, name, slug, status, cover_image_url, created_at)
      values (${ids["a"]}, 'r3fx emptycover', 'r3fx-emptycover', 'active', '', now() + interval '30 hours')`
    await q`insert into products (store_id, name, slug, status, cover_image_url, created_at)
      values (${ids["c"]}, 'r3fx pending store', 'r3fx-pending-store', 'active', 'https://img.test/hidden1.jpg', now() + interval '36 hours')`
    await q`insert into products (store_id, name, slug, status, cover_image_url, created_at)
      values (${ids["a"]}, 'r3fx draft', 'r3fx-draft', 'draft', 'https://img.test/hidden2.jpg', now() + interval '36 hours')`
    // The expected featured product: older than the 25, newer than everything real.
    const [cover] = await q<
      IdRow[]
    >`insert into products (store_id, name, slug, status, cover_image_url, category_id, created_at)
      values (${ids["b"]}, 'r3fx cover', 'r3fx-cover', 'active', 'https://img.test/r3fx-cover.jpg', ${ids["x"]}, now() + interval '12 hours') returning id`
    ids["cover"] = cover!["id"]
    await q`insert into product_variants (product_id, name, price_myr_sen, stock_count, sort_order, fulfillment_mode, sku, is_active)
      values (${ids["cover"]}, 'Regular', 2500, 5, 0, 'normal', 'r3fx-v-1', true),
             (${ids["cover"]}, 'Retired', 100, 5, 1, 'normal', 'r3fx-v-2', false)`
    // A draft product in category Y: Y must not appear (no active product).
    await q`insert into products (store_id, name, slug, status, category_id)
      values (${ids["a"]}, 'r3fx in y', 'r3fx-in-y', 'draft', ${ids["y"]})`
  })

  afterAll(async () => {
    if (!owner) return
    const q = owner.sql
    await q`delete from product_variants where product_id in (select id from products where slug like 'r3fx-%')`
    await q`delete from products where slug like 'r3fx-%'`
    await q`delete from stores where slug like 'r3fx-%'`
    await q`delete from categories where slug like 'r3fx-cat-%'`
    await owner.close()
  })

  it("featured is the newest active product with a cover, even when 20+ newer ones have none", async () => {
    const page = await getProducts({ page: 1 })
    expect(page.products).toHaveLength(20)
    expect(page.products.every((p) => !p.coverImageUrl)).toBe(true) // the old way would find nothing
    const [truth] = await owner.sql<IdRow[]>`select p.id from products p
      join stores s on s.id = p.store_id and s.status = 'active'
      where p.status = 'active' and p.cover_image_url is not null and p.cover_image_url <> ''
      order by p.created_at desc, p.id desc limit 1`
    const featured = await getFeatured()
    expect(featured?.id).toBe(truth!["id"])
    expect(featured?.id).toBe(ids["cover"])
    expect(featured?.storeSlug).toBe("r3fx-b")
    expect(featured?.minPriceSen).toBe(2500) // the retired variant (100) does not count
  })

  it("a featured product with no active variant price keeps null, not zero", async () => {
    await owner.sql`update product_variants set is_active = false where product_id = ${ids["cover"]!}`
    const featured = await getFeatured()
    expect(featured?.id).toBe(ids["cover"])
    expect(featured?.minPriceSen).toBeNull()
    await owner.sql`update product_variants set is_active = true where sku = 'r3fx-v-1'`
  })

  it("never returns the pending-store product, the draft or the empty-cover product", async () => {
    const data = await getHomeData()
    const hidden = ["r3fx-pending-store", "r3fx-draft", "r3fx-emptycover"]
    expect(hidden).not.toContain(data.featured?.slug)
  })

  it("favourites are the 8 newest products", async () => {
    const data = await getHomeData()
    const page = await getProducts({ page: 1 })
    expect(data.favourites.map((p) => p.id)).toEqual(page.products.slice(0, 8).map((p) => p.id))
    expect(data.favourites).toHaveLength(8)
  })

  it("categories equal the independent count, and the empty or inactive ones are absent", async () => {
    const rows = await owner.sql<CountRow[]>`select c.id, count(p.id)::int as n
      from categories c
      join products p on p.category_id = c.id and p.status = 'active'
      join stores s on s.id = p.store_id and s.status = 'active'
      where c.is_active = true
      group by c.id, c.name order by count(p.id) desc, c.name asc`
    const got = await getCategoriesWithCounts()
    expect(got.map((c) => [c.id, c.activeProductCount])).toEqual(rows.map((r) => [r.id, r.n]))
    const gotIds = got.map((c) => c.id)
    expect(gotIds).toContain(ids["x"])
    expect(gotIds).not.toContain(ids["y"])
    expect(gotIds).not.toContain(ids["z"])
  })

  it("brands and counts equal the independent answers", async () => {
    const brands = await owner.sql<CountRow[]>`select s.id, count(p.id)::int as n
      from stores s join products p on p.store_id = s.id and p.status = 'active'
      where s.status = 'active' group by s.id, s.name
      order by count(p.id) desc, s.name asc, s.id asc limit 3`
    const [products] = await owner.sql<NRow[]>`select count(*)::int as n from products p
      join stores s on s.id = p.store_id and s.status = 'active' where p.status = 'active'`
    const [brandCount] = await owner.sql<NRow[]>`select count(distinct s.id)::int as n from stores s
      join products p on p.store_id = s.id and p.status = 'active' where s.status = 'active'`
    const data = await getHomeData()
    expect(data.brands.map((b) => [b.id, b.productCount])).toEqual(brands.map((b) => [b.id, b.n]))
    expect(data.brands.length).toBeLessThanOrEqual(3)
    expect(data.counts.products).toBe(products!.n)
    expect(data.counts.brands).toBe(brandCount!.n)
    const catCount = (await getCategoriesWithCounts()).length
    expect(data.counts.categories).toBe(catCount)
    expect(data.categories.length).toBeLessThanOrEqual(12)
  })
})
