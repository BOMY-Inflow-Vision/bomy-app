import { describe, expect, it } from "vitest"

import {
  FLASH_TOAST_COOKIE,
  MAX_FLASH_MESSAGE_LENGTH,
  parseFlashToast,
  readCookieValue,
  serializeFlashToast,
} from "@/lib/flash-toast"

// Next's cookie store URI-encodes values exactly once on set (edge-runtime stringifyCookie).
const asSetByNext = (value: string) => encodeURIComponent(value)

describe("serializeFlashToast / parseFlashToast", () => {
  it("round-trips a toast", () => {
    const raw = serializeFlashToast({ type: "success", message: "Address saved" })
    expect(parseFlashToast(raw)).toEqual({ type: "success", message: "Address saved" })
  })

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["not JSON", "{nope"],
    ["not an object", '"hello"'],
    ["unknown type", JSON.stringify({ type: "danger", message: "x" })],
    ["blank message", JSON.stringify({ type: "info", message: "   " })],
    ["non-string message", JSON.stringify({ type: "info", message: 42 })],
  ])("rejects %s", (_label, raw) => {
    expect(parseFlashToast(raw)).toBeNull()
  })

  it("caps overly long messages", () => {
    const long = "x".repeat(MAX_FLASH_MESSAGE_LENGTH + 50)
    const parsed = parseFlashToast(JSON.stringify({ type: "error", message: long }))
    expect(parsed?.message).toHaveLength(MAX_FLASH_MESSAGE_LENGTH)
    expect(
      parseFlashToast(serializeFlashToast({ type: "error", message: long }))?.message,
    ).toHaveLength(MAX_FLASH_MESSAGE_LENGTH)
  })
})

describe("readCookieValue", () => {
  it("finds and decodes the flash cookie among others", () => {
    const value = serializeFlashToast({ type: "info", message: "50% off — signed out" })
    const header = `a=1; ${FLASH_TOAST_COOKIE}=${asSetByNext(value)}; b=2`
    expect(parseFlashToast(readCookieValue(header, FLASH_TOAST_COOKIE))).toEqual({
      type: "info",
      message: "50% off — signed out",
    })
  })

  it("does not match a cookie whose name merely ends with the target", () => {
    expect(readCookieValue(`x${FLASH_TOAST_COOKIE}=1`, FLASH_TOAST_COOKIE)).toBeNull()
  })

  it("returns null when absent or malformed", () => {
    expect(readCookieValue("a=1; b=2", FLASH_TOAST_COOKIE)).toBeNull()
    expect(readCookieValue("", FLASH_TOAST_COOKIE)).toBeNull()
    expect(readCookieValue(`${FLASH_TOAST_COOKIE}=%E0%A4%A`, FLASH_TOAST_COOKIE)).toBeNull()
  })
})
