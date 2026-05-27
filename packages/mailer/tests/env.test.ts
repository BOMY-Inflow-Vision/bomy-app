import { describe, expect, it } from "vitest"
import { configFromEnv } from "../src/env.js"

describe("configFromEnv — disabled mode", () => {
  it("returns enabled: false when EMAIL_DELIVERY_ENABLED is unset", () => {
    const cfg = configFromEnv({})
    expect(cfg.enabled).toBe(false)
  })

  it("does not throw when SMTP_HOST and MAIL_FROM are missing in disabled mode", () => {
    expect(() => configFromEnv({})).not.toThrow()
  })

  it("returns enabled: false when EMAIL_DELIVERY_ENABLED is any value other than 'true'", () => {
    expect(configFromEnv({ EMAIL_DELIVERY_ENABLED: "false" }).enabled).toBe(false)
    expect(configFromEnv({ EMAIL_DELIVERY_ENABLED: "yes" }).enabled).toBe(false)
    expect(configFromEnv({ EMAIL_DELIVERY_ENABLED: "1" }).enabled).toBe(false)
  })
})

describe("configFromEnv — enabled validation", () => {
  const ENABLED_BASE = {
    EMAIL_DELIVERY_ENABLED: "true",
    SMTP_HOST: "smtp.example.com",
    MAIL_FROM: "noreply@bomy.my",
  }

  it("returns a valid config with sensible defaults when only required vars are set", () => {
    const cfg = configFromEnv(ENABLED_BASE)
    expect(cfg).toEqual({
      enabled: true,
      host: "smtp.example.com",
      port: 587,
      secure: false,
      from: "noreply@bomy.my",
    })
  })

  it("throws when SMTP_HOST is missing", () => {
    expect(() => configFromEnv({ EMAIL_DELIVERY_ENABLED: "true", MAIL_FROM: "x@y" })).toThrow(
      /SMTP_HOST is required/,
    )
  })

  it("throws when MAIL_FROM is missing", () => {
    expect(() =>
      configFromEnv({ EMAIL_DELIVERY_ENABLED: "true", SMTP_HOST: "smtp.example.com" }),
    ).toThrow(/MAIL_FROM is required/)
  })

  it("throws when SMTP_PORT is not a number", () => {
    expect(() => configFromEnv({ ...ENABLED_BASE, SMTP_PORT: "abc" })).toThrow(
      /SMTP_PORT must be a valid number/,
    )
  })

  it("throws when SMTP_USER is set without SMTP_PASS (or vice versa)", () => {
    expect(() => configFromEnv({ ...ENABLED_BASE, SMTP_USER: "u" })).toThrow(
      /SMTP_USER and SMTP_PASS must both be set or both absent/,
    )
    expect(() => configFromEnv({ ...ENABLED_BASE, SMTP_PASS: "p" })).toThrow(
      /SMTP_USER and SMTP_PASS must both be set or both absent/,
    )
  })

  it("includes user/pass when both are set", () => {
    const cfg = configFromEnv({ ...ENABLED_BASE, SMTP_USER: "u", SMTP_PASS: "p" })
    expect(cfg.user).toBe("u")
    expect(cfg.pass).toBe("p")
  })

  it("passes through replyTo when MAIL_REPLY_TO is set", () => {
    const cfg = configFromEnv({ ...ENABLED_BASE, MAIL_REPLY_TO: "support@bomy.my" })
    expect(cfg.replyTo).toBe("support@bomy.my")
  })

  it("respects SMTP_SECURE=true", () => {
    const cfg = configFromEnv({ ...ENABLED_BASE, SMTP_SECURE: "true" })
    expect(cfg.secure).toBe(true)
  })
})
