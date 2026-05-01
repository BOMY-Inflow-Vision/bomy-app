export class HitPayError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly body: unknown,
  ) {
    super(message)
    this.name = "HitPayError"
  }
}

export class HitPayAuthError extends HitPayError {
  constructor(body: unknown) {
    super("HitPay authentication failed (401)", 401, body)
    this.name = "HitPayAuthError"
  }
}

export class HitPayValidationError extends HitPayError {
  constructor(body: unknown) {
    super("HitPay validation error (422)", 422, body)
    this.name = "HitPayValidationError"
  }
}

export class HitPayNotFoundError extends HitPayError {
  constructor(body: unknown) {
    super("HitPay resource not found (404)", 404, body)
    this.name = "HitPayNotFoundError"
  }
}

export class HitPayRateLimitError extends HitPayError {
  constructor(body: unknown) {
    super("HitPay rate limit exceeded (429)", 429, body)
    this.name = "HitPayRateLimitError"
  }
}
