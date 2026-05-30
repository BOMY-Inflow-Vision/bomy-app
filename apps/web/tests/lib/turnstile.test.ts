import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { verifyTurnstile } from "@/lib/turnstile"

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

function mockFetchResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  } as Response
}

describe("verifyTurnstile", () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    process.env["TURNSTILE_SECRET_KEY"] = "test-secret"
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env["TURNSTILE_SECRET_KEY"]
    vi.restoreAllMocks()
  })

  it("returns missing-secret when TURNSTILE_SECRET_KEY is unset; logs misconfigured", async () => {
    delete process.env["TURNSTILE_SECRET_KEY"]
    const result = await verifyTurnstile("any-token")
    expect(result).toEqual({ success: false, reason: "missing-secret" })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledWith({ event: "turnstile_misconfigured" })
  })

  it("returns invalid-response when token is null; no fetch, no log", async () => {
    const result = await verifyTurnstile(null)
    expect(result).toEqual({ success: false, reason: "invalid-response" })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(consoleErrorSpy).not.toHaveBeenCalled()
    expect(consoleInfoSpy).not.toHaveBeenCalled()
  })

  it("returns invalid-response when token is empty string; no fetch, no log", async () => {
    const result = await verifyTurnstile("")
    expect(result).toEqual({ success: false, reason: "invalid-response" })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(consoleErrorSpy).not.toHaveBeenCalled()
    expect(consoleInfoSpy).not.toHaveBeenCalled()
  })

  it("POSTs to Cloudflare /siteverify with form-urlencoded body", async () => {
    fetchMock.mockResolvedValue(mockFetchResponse(200, { success: true }))
    await verifyTurnstile("token-abc")
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]! as [
      string,
      RequestInit & { headers: Record<string, string> },
    ]
    expect(url).toBe(SITEVERIFY_URL)
    expect(init.method).toBe("POST")
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded")
  })

  it("includes secret and response in POST body when no remoteIp", async () => {
    fetchMock.mockResolvedValue(mockFetchResponse(200, { success: true }))
    await verifyTurnstile("token-abc")
    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit]
    expect(init.body).toBe("secret=test-secret&response=token-abc")
  })

  it("includes remoteip in POST body when remoteIp arg passed", async () => {
    fetchMock.mockResolvedValue(mockFetchResponse(200, { success: true }))
    await verifyTurnstile("token-abc", "1.2.3.4")
    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit]
    expect(init.body).toBe("secret=test-secret&response=token-abc&remoteip=1.2.3.4")
  })

  it("uses AbortSignal.timeout(5000)", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout")
    fetchMock.mockResolvedValue(mockFetchResponse(200, { success: true }))
    await verifyTurnstile("token-abc")
    expect(timeoutSpy).toHaveBeenCalledWith(5000)
  })

  it("returns network-error on fetch throw; logs message", async () => {
    fetchMock.mockRejectedValue(new Error("boom"))
    const result = await verifyTurnstile("token-abc")
    expect(result).toEqual({ success: false, reason: "network-error" })
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      event: "turnstile_network_error",
      message: "boom",
    })
  })

  it("returns network-error on non-200; log payload includes status", async () => {
    fetchMock.mockResolvedValue(mockFetchResponse(503, {}))
    const result = await verifyTurnstile("token-abc")
    expect(result).toEqual({ success: false, reason: "network-error" })
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      event: "turnstile_network_error",
      status: 503,
    })
  })

  it("returns network-error on JSON parse failure", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      ok: true,
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
    } as unknown as Response)
    const result = await verifyTurnstile("token-abc")
    expect(result).toEqual({ success: false, reason: "network-error" })
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      event: "turnstile_network_error",
      message: "json-parse-failed",
    })
  })

  it("returns success:true when Cloudflare body has success:true", async () => {
    fetchMock.mockResolvedValue(mockFetchResponse(200, { success: true }))
    const result = await verifyTurnstile("token-abc")
    expect(result).toEqual({ success: true })
  })

  it("returns invalid-response when Cloudflare body has success:false; log captures errorCodes", async () => {
    fetchMock.mockResolvedValue(
      mockFetchResponse(200, {
        success: false,
        "error-codes": ["timeout-or-duplicate", "invalid-input-response"],
      }),
    )
    const result = await verifyTurnstile("token-abc")
    expect(result).toEqual({ success: false, reason: "invalid-response" })
    expect(consoleInfoSpy).toHaveBeenCalledWith({
      event: "turnstile_rejected",
      errorCodes: ["timeout-or-duplicate", "invalid-input-response"],
    })
  })
})
