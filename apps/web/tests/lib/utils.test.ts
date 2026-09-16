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

// PR #145 review (Bob, LOW 5): without registering these in tailwind-merge's "animate" group,
// cn() keeps both classes instead of the later one winning — e.g. ToastRow's
// cn("animate-toast-in", ..., leaving && "animate-toast-out") would emit both classes
// simultaneously on exit, and which one actually took effect depended on declaration order in
// the generated stylesheet rather than on cn()'s call order (this was PR #124's exact failure
// mode for the radius group, recurring here for animate).
describe("cn — custom animate classes", () => {
  it("collapses a custom animate class when overridden by another custom animate class", () => {
    expect(cn("animate-toast-in", "animate-toast-out")).toBe("animate-toast-out")
    expect(cn("animate-wheel-roll-in", "animate-step-pulse")).toBe("animate-step-pulse")
  })

  it("still collapses the stock animate scale as before (no regression on existing behavior)", () => {
    expect(cn("animate-spin", "animate-pulse")).toBe("animate-pulse")
  })

  it("a custom animate class overrides a stock animate class and vice versa", () => {
    expect(cn("animate-spin", "animate-toast-in")).toBe("animate-toast-in")
    expect(cn("animate-toast-in", "animate-spin")).toBe("animate-spin")
  })
})
