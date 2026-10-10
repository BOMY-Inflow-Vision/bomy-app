import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = resolve(__dirname, "../../../..")

describe.each(["apps/web", "apps/admin"])("%s toaster", (app) => {
  const src = readFileSync(resolve(ROOT, app, "src/components/toaster.tsx"), "utf8")

  it("styles every banner with status tokens, not palette colours", () => {
    expect(src).not.toMatch(/\b(?:bg|text|border)-(?:emerald|blue|amber|red|green|yellow)-\d/)
    for (const token of [
      "border-success/30 bg-success-subtle text-success",
      "border-info/30 bg-info-subtle text-info",
      "border-warning/30 bg-warning-subtle text-warning",
      "border-destructive/30 bg-card text-destructive",
    ])
      expect(src).toContain(token)
  })

  it("gives the dismiss button a theme-safe hover and a focus ring that matches the text", () => {
    expect(src).toContain("hover:bg-foreground/10")
    expect(src).toContain("focus-visible:ring-2 focus-visible:ring-current")
    expect(src).not.toContain("bg-black/")
  })
})
