import { describe, expect, it } from "vitest"

import { ActorError, UsageError } from "../../scripts/ops/platform-config-flip-args.js"
import { assertKeyRules } from "../../scripts/ops/platform-config-flip-core.js"

describe("assertKeyRules (Stripe design PR 3 review)", () => {
  it("active_psp: bomy_admin and bomy_finance may set a known provider", () => {
    expect(() => assertKeyRules("active_psp", "bomy_admin", "hitpay")).not.toThrow()
    expect(() => assertKeyRules("active_psp", "bomy_finance", "stripe")).not.toThrow()
  })

  it("active_psp: bomy_ops is refused (design §13 decision 6)", () => {
    expect(() => assertKeyRules("active_psp", "bomy_ops", "hitpay")).toThrow(ActorError)
  })

  it.each([["paypal"], ["HitPay"], [""], [true], [null]])(
    "active_psp: value %j is refused",
    (value) => {
      expect(() => assertKeyRules("active_psp", "bomy_admin", value)).toThrow(UsageError)
    },
  )

  it("checkout_enabled / subscriptions_enabled keep the general rule (all staff roles)", () => {
    for (const key of ["checkout_enabled", "subscriptions_enabled"]) {
      expect(() => assertKeyRules(key, "bomy_ops", true)).not.toThrow()
    }
  })
})
