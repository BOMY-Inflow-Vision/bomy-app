// @vitest-environment jsdom
//
// Filter chips (seller products and orders) and page links (/products, /brands), PR 5d-4 and 5d-5.
// Written first against the hand-built chips and links (baseline); after the FilterTabs and
// Pagination swap the hrefs, their order, the active item and the visual classes are unchanged.
// Only aria-current on the active chip, the focus ring and the nav label are new.
// Seller products: an invalid nonempty status leaves NO chip active. Seller orders: it selects All.
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

const data = vi.hoisted(() => ({ total: 1, page: 1 }))

vi.mock("@/auth", () => ({
  auth: () => Promise.resolve({ user: { id: "user-1", role: "seller_owner" } }),
}))
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`)
  },
  notFound: () => {
    throw new Error("notFound")
  },
}))
vi.mock("@bomy/db", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  const stubTx = {
    select: () => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: "store-1" }]) }) }),
    }),
  }
  return {
    ...actual,
    makeDb: () => ({ db: {} }),
    withTenant: (_db: unknown, _ctx: unknown, fn: (tx: unknown) => unknown) =>
      Promise.resolve(fn(stubTx)),
  }
})
vi.mock("@/app/seller/dashboard/products/actions", () => ({
  getSellerProducts: () => Promise.resolve([]),
}))
vi.mock("@/app/seller/dashboard/orders/queries", () => ({
  fetchSellerOrders: () => Promise.resolve([]),
}))
vi.mock("@/app/products/queries", () => ({
  formatMyrSen: (n: number) => String(n),
  getCategories: () => Promise.resolve([]),
  getProducts: () => Promise.resolve({ products: [], total: 0, totalPages: data.total }),
}))
vi.mock("@/app/brands/queries", () => ({
  getBrands: () => Promise.resolve({ brands: [], total: 0, totalPages: data.total }),
  getStoreCategories: () => Promise.resolve([]),
}))

import BrandsPage from "@/app/brands/page"
import ProductsPage from "@/app/products/page"
import SellerOrdersPage from "@/app/seller/dashboard/orders/page"
import SellerProductsPage from "@/app/seller/dashboard/products/page"

// Set to true in the swap commit: the active chip then carries aria-current="page".
const AFTER = false

const doc = (html: string) => new DOMParser().parseFromString(html, "text/html")
const render = async (el: Promise<React.ReactElement>) => renderToStaticMarkup(await el)

type Chip = { text: string; href: string; classes: string[]; current: string | null }

function chips(html: string, hrefPrefix: string, texts: string[]): Chip[] {
  return [...doc(html).querySelectorAll<HTMLAnchorElement>("a")]
    .filter(
      (a) =>
        (a.getAttribute("href") ?? "").startsWith(hrefPrefix) &&
        texts.includes(a.textContent?.trim() ?? "") &&
        /\bpy-1\b/.test(a.className),
    )
    .map((a) => ({
      text: a.textContent?.trim() ?? "",
      href: a.getAttribute("href") ?? "",
      classes: a.className.split(/\s+/),
      current: a.getAttribute("aria-current"),
    }))
}

const isActive = (c: Chip) =>
  c.classes.includes("bg-primary") || c.classes.includes("bg-foreground")

function checkCurrent(got: Chip[]) {
  for (const c of got) expect(c.current).toBe(AFTER && isActive(c) ? "page" : null)
}

describe("seller products chips (primary look; invalid status leaves none active)", () => {
  const L = ["All", "Draft", "Active", "Archived"]
  const HREFS = [
    "/seller/dashboard/products",
    "/seller/dashboard/products?status=draft",
    "/seller/dashboard/products?status=active",
    "/seller/dashboard/products?status=archived",
  ]
  it.each([
    [{}, ["All"]],
    [{ status: "draft" }, ["Draft"]],
    [{ status: "archived" }, ["Archived"]],
    [{ status: "bogus" }, []],
    [{ status: "" }, ["All"]],
  ])("%j", async (sp, active) => {
    const html = await render(SellerProductsPage({ searchParams: Promise.resolve(sp) }))
    const got = chips(html, "/seller/dashboard/products", L)
    expect(got.map((c) => [c.text, c.href])).toEqual(L.map((t, i) => [t, HREFS[i]]))
    expect(got.filter(isActive).map((c) => c.text)).toEqual(active)
    for (const c of got) {
      expect(c.classes).toEqual(
        expect.arrayContaining(["rounded-full", "px-3", "py-1", "text-xs", "font-medium"]),
      )
      expect(c.classes).toEqual(
        expect.arrayContaining(
          isActive(c)
            ? ["bg-primary", "text-primary-foreground"]
            : ["bg-muted", "text-muted-foreground", "hover:bg-muted/80"],
        ),
      )
    }
    checkCurrent(got)
  })
})

describe("seller orders chips (inverse look; invalid status selects All)", () => {
  const S = ["processing", "shipped", "delivered", "completed", "cancelled"]
  it.each([
    [{}, "All"],
    [{ status: "shipped" }, "shipped"],
    [{ status: "bogus" }, "All"],
  ])("%j", async (sp, active) => {
    const html = await render(SellerOrdersPage({ searchParams: Promise.resolve(sp) }))
    const got = chips(html, "/seller/dashboard/orders", ["All", ...S])
    expect(got.map((c) => [c.text, c.href])).toEqual([
      ["All", "/seller/dashboard/orders"],
      ...S.map((s) => [s, `/seller/dashboard/orders?status=${s}`]),
    ])
    expect(got.filter(isActive).map((c) => c.text)).toEqual([active])
    for (const c of got) {
      expect(c.classes).toEqual(expect.arrayContaining(["rounded-full", "px-3", "py-1", "text-sm"]))
      expect(c.classes).toEqual(
        expect.arrayContaining(
          isActive(c)
            ? ["bg-foreground", "text-background"]
            : ["bg-muted", "text-muted-foreground"],
        ),
      )
      expect(c.classes).not.toContain("font-medium")
    }
    expect(got.slice(1).every((c) => c.classes.includes("capitalize"))).toBe(true)
    checkCurrent(got)
  })
})

type Page = { label: string | null; href: string | null; current: string | null; cls: string[] }

function pageLinks(html: string, label: string) {
  const nav = doc(html).querySelector(`nav[aria-label="${label}"]`)
  if (!nav) return null
  const items: Array<string | Page> = [...nav.children].map((el) =>
    el.tagName === "A"
      ? {
          label: el.getAttribute("aria-label"),
          href: el.getAttribute("href"),
          current: el.getAttribute("aria-current"),
          cls: el.className.split(/\s+/),
          text: el.textContent,
        }
      : (el.textContent ?? ""),
  ) as never
  return { navClass: nav.className, items }
}

const ACTIVE_PAGE = ["bg-primary", "text-primary-foreground"]
const INACTIVE_PAGE = ["border", "border-border", "text-muted-foreground", "hover:bg-muted"]

describe("/products page links (all numbers, h-8 w-8)", () => {
  it.each([
    [1, 1, null],
    [7, 4, null],
    [8, 1, null],
    [20, 20, null],
  ])("totalPages %i, page %i", async (total, page) => {
    data.total = total
    const html = await render(
      ProductsPage({
        searchParams: Promise.resolve({ page: String(page), q: "tea", category: "c1" }),
      }),
    )
    const res = pageLinks(html, "Products pagination")
    if (total === 1) {
      expect(res).toBeNull()
      return
    }
    expect(res!.navClass.split(/\s+/)).toEqual(
      expect.arrayContaining(["mt-8", "flex", "flex-wrap", "justify-center", "gap-2"]),
    )
    const links = res!.items as Array<Page & { text: string }>
    expect(links.map((l) => l.text)).toEqual(Array.from({ length: total }, (_, i) => String(i + 1)))
    links.forEach((l, i) => {
      const n = i + 1
      const qs = new URLSearchParams({
        q: "tea",
        category: "c1",
        ...(n > 1 ? { page: String(n) } : {}),
      })
      expect(l.href).toBe(`/products?${qs.toString()}`)
      expect(l.label).toBe(`Page ${n}`)
      expect(l.current).toBe(n === page ? "page" : null)
      expect(l.cls).toEqual(
        expect.arrayContaining([
          "flex",
          "h-8",
          "w-8",
          "items-center",
          "justify-center",
          "rounded-control",
          "text-sm",
          ...(n === page ? ACTIVE_PAGE : INACTIVE_PAGE),
        ]),
      )
    })
  })

  it("page 1 with no filters links to /products? (trailing question mark kept)", async () => {
    data.total = 2
    const html = await render(ProductsPage({ searchParams: Promise.resolve({}) }))
    const links = pageLinks(html, "Products pagination")!.items as Page[]
    expect(links.map((l) => l.href)).toEqual(["/products?", "/products?page=2"])
  })
})

describe("/brands page links (collapsed range, h-11 w-11)", () => {
  it.each([
    [7, 4, ["1", "2", "3", "4", "5", "6", "7"]],
    [8, 1, ["1", "2", "…", "8"]],
    [8, 4, ["1", "…", "3", "4", "5", "…", "8"]],
    [20, 10, ["1", "…", "9", "10", "11", "…", "20"]],
    [20, 20, ["1", "…", "19", "20"]],
  ])("totalPages %i, page %i", async (total, page, shape) => {
    data.total = total
    const html = await render(
      BrandsPage({
        searchParams: Promise.resolve({ page: String(page), q: "tea", category: "c1" }),
      }),
    )
    const res = pageLinks(html, "Brands pagination")!
    expect(res.navClass.split(/\s+/)).toEqual(
      expect.arrayContaining(["mt-8", "flex", "justify-center", "gap-1"]),
    )
    expect(res.navClass).not.toContain("flex-wrap")
    const texts = (res.items as Array<string | (Page & { text: string })>).map((i) =>
      typeof i === "string" ? i : i.text,
    )
    expect(texts).toEqual(shape)
    for (const item of res.items as Array<string | (Page & { text: string })>) {
      if (typeof item === "string") continue
      const n = Number(item.text)
      const qs = new URLSearchParams({
        q: "tea",
        category: "c1",
        ...(n > 1 ? { page: String(n) } : {}),
      })
      expect(item.href).toBe(`/brands?${qs.toString()}`)
      expect(item.label).toBe(`Page ${n}`)
      expect(item.current).toBe(n === page ? "page" : null)
      expect(item.cls).toEqual(
        expect.arrayContaining([
          "h-11",
          "w-11",
          "rounded-control",
          ...(n === page ? ACTIVE_PAGE : INACTIVE_PAGE),
        ]),
      )
    }
    const ellipses = [...doc(html).querySelectorAll('nav[aria-label="Brands pagination"] span')]
    expect(ellipses.every((e) => e.getAttribute("aria-hidden") === "true")).toBe(true)
  })

  it("page 1 with no filters links to /brands", async () => {
    data.total = 2
    const html = await render(BrandsPage({ searchParams: Promise.resolve({}) }))
    const links = pageLinks(html, "Brands pagination")!.items as Page[]
    expect(links.map((l) => l.href)).toEqual(["/brands", "/brands?page=2"])
  })
})
