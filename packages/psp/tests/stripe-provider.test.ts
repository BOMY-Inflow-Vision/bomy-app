import { describe, expect, it } from "vitest"

import { PspUnsupportedError } from "../src/errors.js"
import { StripeProvider } from "../src/stripe/provider.js"

describe("StripeProvider placeholder (PR 3)", () => {
  const p = new StripeProvider()

  it("is never configured, whatever the env holds", () => {
    const saved = process.env["STRIPE_SECRET_KEY"]
    process.env["STRIPE_SECRET_KEY"] = "sk_live_x"
    try {
      expect(p.isConfigured()).toBe(false)
    } finally {
      if (saved === undefined) delete process.env["STRIPE_SECRET_KEY"]
      else process.env["STRIPE_SECRET_KEY"] = saved
    }
  })

  it("rejects every outbound call with PspUnsupportedError", async () => {
    const calls: Array<() => Promise<unknown>> = [
      () =>
        p.createOneTimeCheckout({
          kind: "order",
          bomyRefId: "x",
          amountSen: 1000n,
          currency: "MYR",
          customerEmail: "a@b.c",
          description: "d",
          successUrl: "https://x",
          idempotencyKey: "k",
        }),
      () => p.expireCheckout("cs_1"),
      () =>
        p.createRecurringCheckout({
          kind: "member_subscription",
          bomyRefId: "x",
          amountSen: 7500n,
          currency: "MYR",
          interval: "year",
          customerEmail: "a@b.c",
          description: "d",
          successUrl: "https://x",
          startDate: new Date(),
          idempotencyKey: "k",
        }),
      () => p.cancelRecurring("sub_1", { atPeriodEnd: true }),
      () => p.refund({ pspPaymentId: "pi_1", amountSen: 1n, reason: "r", idempotencyKey: "k" }),
      () => p.getPaymentFee("pi_1"),
    ]
    for (const call of calls) {
      await expect(call()).rejects.toBeInstanceOf(PspUnsupportedError)
    }
  })
})
