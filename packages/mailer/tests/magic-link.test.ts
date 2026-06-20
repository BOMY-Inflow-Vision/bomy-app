import { describe, expect, it, vi } from "vitest"

import { sendMagicLink } from "../src/magic-link.js"
import type { Mailer } from "../src/mailer.js"

describe("sendMagicLink", () => {
  it("sends a one-time sign-in link to the requested address", async () => {
    const sendMail = vi.fn<Mailer["sendMail"]>().mockResolvedValue(undefined)
    const mailer: Mailer = {
      sendMail,
      close: vi.fn().mockResolvedValue(undefined),
    }

    await sendMagicLink(mailer, {
      to: "buyer@example.com",
      url: "https://brandsofmalaysia.com/api/auth/callback/nodemailer?token=abc",
    })

    expect(sendMail).toHaveBeenCalledOnce()
    const message = sendMail.mock.calls[0]![0]
    expect(message.to).toBe("buyer@example.com")
    expect(message.subject).toBe("Sign in to BOMY")
    expect(message.text).toContain(
      "https://brandsofmalaysia.com/api/auth/callback/nodemailer?token=abc",
    )
  })
})
