import {
  HitPayAuthError,
  HitPayError,
  HitPayNotFoundError,
  HitPayRateLimitError,
  HitPayValidationError,
} from "./errors.js"
import type {
  CreatePaymentRequestInput,
  CreateRecurringBillingInput,
  CreateRefundInput,
  CreateTransferInput,
  PaymentRequestResponse,
  RecurringBillingResponse,
  RefundResponse,
  TransferResponse,
} from "./types.js"

export interface HitPayClientOptions {
  apiKey: string
  saltKey: string
  baseUrl: string
}

export class HitPayClient {
  readonly #apiKey: string
  readonly #baseUrl: string

  constructor(options: HitPayClientOptions) {
    this.#apiKey = options.apiKey
    this.#baseUrl = options.baseUrl.replace(/\/$/, "")
  }

  async createPaymentRequest(input: CreatePaymentRequestInput): Promise<PaymentRequestResponse> {
    return this.#post<PaymentRequestResponse>("/v1/payment-requests", input)
  }

  async createRecurringBilling(
    input: CreateRecurringBillingInput,
  ): Promise<RecurringBillingResponse> {
    return this.#post<RecurringBillingResponse>("/v1/recurring-billing", input)
  }

  async cancelRecurringBilling(id: string): Promise<void> {
    await this.#delete(`/v1/recurring-billing/${id}`)
  }

  async createRefund(input: CreateRefundInput): Promise<RefundResponse> {
    return this.#post<RefundResponse>("/v1/refund", input)
  }

  async createTransfer(input: CreateTransferInput): Promise<TransferResponse> {
    return this.#post<TransferResponse>("/v1/transfers", input)
  }

  async #post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.#baseUrl}${path}`, {
      method: "POST",
      headers: {
        "X-BUSINESS-API-KEY": this.#apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    })
    return this.#handleResponse<T>(res)
  }

  async #delete(path: string): Promise<void> {
    const res = await fetch(`${this.#baseUrl}${path}`, {
      method: "DELETE",
      headers: {
        "X-BUSINESS-API-KEY": this.#apiKey,
        Accept: "application/json",
      },
    })
    if (res.status === 204 || res.status === 200) return
    await this.#handleResponse<void>(res)
  }

  async #handleResponse<T>(res: Response): Promise<T> {
    if (res.ok) {
      if (res.status === 204) return undefined as T
      return res.json() as Promise<T>
    }

    let body: unknown
    try {
      body = await res.json()
    } catch {
      body = await res.text()
    }

    switch (res.status) {
      case 401:
        throw new HitPayAuthError(body)
      case 404:
        throw new HitPayNotFoundError(body)
      case 422:
        throw new HitPayValidationError(body)
      case 429:
        throw new HitPayRateLimitError(body)
      default:
        throw new HitPayError(`HitPay API error (${res.status})`, res.status, body)
    }
  }
}
