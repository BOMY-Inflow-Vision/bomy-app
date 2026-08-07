import { describe, expect, it } from "vitest"

import { cn } from "@/lib/utils"

describe("cn — tailwind-merge custom radius groups", () => {
  it("collapses a custom radius key when overridden by a caller's own radius class", () => {
    expect(cn("rounded-card", "rounded-2xl")).toBe("rounded-2xl")
    expect(cn("rounded-control", "rounded-full")).toBe("rounded-full")
    expect(cn("rounded-input", "rounded-none")).toBe("rounded-none")
  })

  it("still collapses the stock radius scale as before (no regression on existing behavior)", () => {
    expect(cn("rounded-lg", "rounded-2xl")).toBe("rounded-2xl")
  })
})
