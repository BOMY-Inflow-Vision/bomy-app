import type { PspProvider } from "./types.js"

/**
 * The PSP answered with an error status: a DEFINITE rejection, so the request did not take
 * effect (no charge, no refund). Network failures and timeouts are NOT wrapped — their outcome
 * is unknown and callers must treat them differently (e.g. leave a refund `refund_pending`).
 *
 * `code` is a short audit-friendly token. For HitPay it is derived from the error class name
 * exactly as `apps/web/src/app/checkout/actions.ts` did before this package existed:
 * HitPayAuthError → "auth", HitPayValidationError → "validation", HitPayNotFoundError →
 * "notfound", HitPayRateLimitError → "ratelimit", plain HitPayError → "error".
 */
export class PspRequestError extends Error {
  readonly provider: PspProvider
  readonly code: string
  readonly statusCode: number
  readonly body: unknown

  constructor(args: {
    provider: PspProvider
    code: string
    statusCode: number
    body: unknown
    message: string
    cause?: unknown
  }) {
    super(args.message, { cause: args.cause })
    this.name = "PspRequestError"
    this.provider = args.provider
    this.code = args.code
    this.statusCode = args.statusCode
    this.body = args.body
  }
}

/** The provider cannot do this (not built yet, or not a capability of that PSP). */
export class PspUnsupportedError extends Error {
  readonly provider: PspProvider

  constructor(provider: PspProvider, message: string) {
    super(message)
    this.name = "PspUnsupportedError"
    this.provider = provider
  }
}

/**
 * Shape check rather than `instanceof`: Next.js `transpilePackages` can duplicate class
 * identity across chunks (see the note in the membership action), so `instanceof` alone is
 * not reliable in the apps.
 */
export function isPspRequestError(err: unknown): err is PspRequestError {
  return (
    err instanceof PspRequestError ||
    (err instanceof Error &&
      err.name === "PspRequestError" &&
      "code" in err &&
      typeof err.code === "string" &&
      "statusCode" in err &&
      typeof err.statusCode === "number")
  )
}

/** Audit token for an outbound PSP failure: the request error's code, else "unknown". */
export function pspErrorCode(err: unknown): string {
  return isPspRequestError(err) ? err.code : "unknown"
}
