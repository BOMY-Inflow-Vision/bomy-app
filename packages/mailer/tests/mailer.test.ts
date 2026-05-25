import { describe, expect, it, vi } from "vitest"
import { createMailer } from "../src/mailer.js"

const BASE_CONFIG = {
  enabled: false,
  host: "localhost",
  port: 587,
  secure: false,
  from: "test@bomy.my",
}

describe("createMailer — disabled mode", () => {
  it("resolves without error and does not throw", async () => {
    const mailer = createMailer(BASE_CONFIG, { info: vi.fn() })
    await expect(
      mailer.sendMail({ to: "a@b.com", subject: "Hi", text: "Body" }),
    ).resolves.toBeUndefined()
  })

  it("logs email_notification_skipped with to and subject but not text", async () => {
    const log = vi.fn()
    const mailer = createMailer(BASE_CONFIG, { info: log })
    await mailer.sendMail({ to: "a@b.com", subject: "Hi", text: "SECRET" })
    expect(log).toHaveBeenCalledOnce()
    const call = log.mock.calls[0] as [Record<string, unknown>, string]
    const obj = call[0]
    const msg = call[1]
    expect(msg).toBe("email_notification_skipped")
    expect(obj["to"]).toBe("a@b.com")
    expect(obj["subject"]).toBe("Hi")
    expect(JSON.stringify(obj)).not.toContain("SECRET")
  })

  it("close() resolves without error", async () => {
    const mailer = createMailer(BASE_CONFIG, { info: vi.fn() })
    await expect(mailer.close()).resolves.toBeUndefined()
  })
})
