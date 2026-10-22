// R3 Task 1: the shape and the honesty of the home page's own words, plus the merge gate.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { HOME_COPY, HOME_COPY_STATUS } from "@/app/_home/home-copy"

function strings(node: unknown, path = ""): [string, string][] {
  if (typeof node === "string") return [[path, node]]
  if (Array.isArray(node)) return node.flatMap((v, i) => strings(v, `${path}.${i}`))
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k))
  }
  return []
}

const ALL = strings(HOME_COPY)

describe("home copy: shape", () => {
  it("has every key the home sections read, and none is empty", () => {
    const keys = ALL.map(([k]) => k)
    for (const k of [
      "meta.title",
      "meta.description",
      "hero.eyebrow",
      "hero.title",
      "hero.sub",
      "hero.primary",
      "hero.secondary",
      "hero.featured.label",
      "hero.featured.cta",
      "hero.themed.title",
      "hero.themed.sub",
      "hero.delivery.title",
      "hero.delivery.sub",
      "marquee.0",
      "browse.title",
      "browse.all",
      "favourites.title",
      "favourites.all",
      "favourites.pillsLabel",
      "promise.eyebrow",
      "promise.statement",
      "promise.chip",
      "stats.title",
      "stats.labels.brands",
      "stats.labels.products",
      "stats.labels.categories",
      "sellers.title",
      "sellers.all",
      "cta.title",
      "cta.sell",
      "cta.member",
    ]) {
      expect(keys, k).toContain(k)
    }
    for (const [k, v] of ALL) expect(v.trim().length, k).toBeGreaterThan(0)
  })

  it("home-copy.ts imports nothing", () => {
    const src = readFileSync(join(__dirname, "../../src/app/_home/home-copy.ts"), "utf8")
    expect(src).not.toMatch(/^\s*import\s/m)
  })

  it("builds the count wording from the unit only", () => {
    expect(HOME_COPY.browse.count(1)).toBe("1 product")
    expect(HOME_COPY.browse.count(5)).toBe("5 products")
    expect(HOME_COPY.browse.count(0)).toBe("0 products")
  })
})

describe("home copy: honesty and originality", () => {
  it("makes no rating, review, customer, free-shipping or delivery-time claim", () => {
    for (const [k, v] of ALL) {
      expect(v, k).not.toMatch(/rating|review|customers|free shipping|delivery in|★|⭐/i)
    }
  })

  it("does not reuse the reference demo's wording", () => {
    const denied = [
      /find your corner/i,
      /this week'?s favou?rites/i,
      /buy once,? keep for good/i,
      /\bbag\b/i,
      /all products/i,
    ]
    for (const [k, v] of ALL) for (const re of denied) expect(v, `${k} vs ${re}`).not.toMatch(re)
  })

  it("states the Pos Laju fact once, only under hero.delivery", () => {
    const hits = ALL.filter(([, v]) => /pos laju/i.test(v))
    expect(hits.map(([k]) => k)).toEqual(["hero.delivery.title"])
  })
})

describe("home copy: merge gate", () => {
  it("is approved by Charlie before the PR merges (fails while the copy is a draft)", () => {
    expect(HOME_COPY_STATUS).toBe("approved")
  })
})
