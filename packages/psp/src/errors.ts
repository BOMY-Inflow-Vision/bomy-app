import type { PspProvider } from "./types.js"

/**
 * Did a failed PSP call take effect?
 *
 * - `rejected`: the PSP answered and the answer proves the request did NOT take effect (no
 *   charge, no refund, no cancellation). Safe to undo local state and let an operator retry.
 * - `unknown`: nothing proves it did not take effect — a 5xx, 408, 409 or 425, or a 2xx whose
 *   body is not usable. The operation may have happened at the PSP. Callers moving money
 *   OUT (refunds) must NOT allow a retry; they keep the row pending for manual verification.
 *
 * Errors that never reach an HTTP answer (network failure, timeout, unparseable JSON) are not
 * wrapped at all and are also unknown: only `isPspRejection` proves a rejection.
 */
export type PspFailureOutcome = "rejected" | "unknown"

/**
 * HTTP statuses that do not prove the request was rejected. 408 Request Timeout, 409 Conflict
 * (e.g. the same operation already in flight) and 425 Too Early can all follow a request the
 * PSP went on to process; every 5xx can be raised after the write committed.
 */
export function outcomeForHttpStatus(statusCode: number): PspFailureOutcome {
  if (statusCode >= 400 && statusCode < 500 && ![408, 409, 425].includes(statusCode)) {
    return "rejected"
  }
  return "unknown"
}

/**
 * The PSP answered with an error status (or an unusable 2xx body). `outcome` says whether
 * that answer proves the request did not take effect — see `PspFailureOutcome`.
 *
 * `code` is a short audit-friendly token, independent of `outcome`. For HitPay it is derived from the error class name
 * exactly as `apps/web/src/app/checkout/actions.ts` did before this package existed:
 * HitPayAuthError → "auth", HitPayValidationError → "validation", HitPayNotFoundError →
 * "notfound", HitPayRateLimitError → "ratelimit", plain HitPayError → "error".
 */
export class PspRequestError extends Error {
  readonly provider: PspProvider
  readonly code: string
  readonly statusCode: number
  readonly body: unknown
  readonly outcome: PspFailureOutcome

  constructor(args: {
    provider: PspProvider
    code: string
    statusCode: number
    body: unknown
    message: string
    /** Defaults to the status-code classification (`outcomeForHttpStatus`). */
    outcome?: PspFailureOutcome
    cause?: unknown
  }) {
    super(args.message, { cause: args.cause })
    this.name = "PspRequestError"
    this.provider = args.provider
    this.code = args.code
    this.statusCode = args.statusCode
    this.body = args.body
    this.outcome = args.outcome ?? outcomeForHttpStatus(args.statusCode)
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

/**
 * True only when the error PROVES the PSP did not act on the request. Anything else — an
 * `unknown`-outcome request error, a network failure, a timeout, a bug — is false, so a caller
 * that branches on this fails safe (treats the outcome as unknown).
 */
export function isPspRejection(err: unknown): boolean {
  return isPspRequestError(err) && "outcome" in err && err.outcome === "rejected"
}

/** Audit token for an outbound PSP failure: the request error's code, else "unknown". */
export function pspErrorCode(err: unknown): string {
  return isPspRequestError(err) ? err.code : "unknown"
}
