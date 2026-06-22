"use client"

import { useEffect, useState, useTransition } from "react"

import { useCart } from "@/lib/cart"
import { CHECKOUT_USER_COPY } from "@/lib/checkout-errors"
import { formatMyrSen } from "@/lib/format"
import { MY_STATES, validateShippingAddress } from "@/lib/shipping-address-schema"
import type { ShippingAddressErrors } from "@/lib/shipping-address-schema"

import { addAddress } from "../account/addresses/actions"
import { initiateCheckout, priceCheckoutPreview } from "./actions"
import type { PreviewResult } from "./actions"

type SavedAddress = {
  id: string
  label: string | null
  recipientName: string
  phone: string
  line1: string
  line2: string | null
  city: string
  postcode: string
  state: string
  isDefault: boolean
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

type AddressState = {
  name: string
  phone: string
  line1: string
  line2: string
  city: string
  postcode: string
  state: string
  country: "MY"
}

const INITIAL_ADDRESS: AddressState = {
  name: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  postcode: "",
  state: "",
  country: "MY",
}

function savedToState(a: SavedAddress): AddressState {
  return {
    name: a.recipientName,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2 ?? "",
    city: a.city,
    postcode: a.postcode,
    state: a.state,
    country: "MY",
  }
}

const INVALID_LINE_COPY: Record<string, string> = {
  missing: "No longer available",
  variant_inactive: "No longer available",
  product_not_active: "No longer available",
  store_not_active: "Store is inactive",
  insufficient_stock: "Out of stock",
  invalid_quantity: "Invalid quantity",
}

export function CheckoutForm({ savedAddresses = [] }: { savedAddresses?: SavedAddress[] }) {
  const { items, clearCart, hydrated } = useCart()
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [voucherId, setVoucherId] = useState<string | null>(null)
  const defaultAddr = savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0]
  const [selectedId, setSelectedId] = useState<string>(defaultAddr?.id ?? "new")
  const [saveToBook, setSaveToBook] = useState(false)
  const [address, setAddress] = useState<AddressState>(() =>
    defaultAddr ? savedToState(defaultAddr) : INITIAL_ADDRESS,
  )
  const [fieldErrors, setFieldErrors] = useState<ShippingAddressErrors>({})
  const [topError, setTopError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setFieldErrors({})
    setTopError(null)
    if (selectedId === "new") {
      setAddress(INITIAL_ADDRESS)
      return
    }
    const a = savedAddresses.find((x) => x.id === selectedId)
    if (a) setAddress(savedToState(a))
  }, [selectedId])

  useEffect(() => {
    if (!hydrated || items.length === 0) {
      setPreview(null)
      return
    }
    startTransition(async () => {
      const r = await priceCheckoutPreview({
        items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        voucherId,
      })
      setPreview(r)
    })
  }, [items, voucherId, hydrated])

  function handleAddressField(field: keyof AddressState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setAddress((prev) => ({ ...prev, [field]: e.target.value }))
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setTopError(null)
    setFieldErrors({})

    const v = validateShippingAddress(address)
    if (!v.ok) {
      setFieldErrors(v.errors)
      return
    }

    startTransition(async () => {
      if (selectedId === "new" && saveToBook) {
        const saved = await addAddress({ label: null, ...v.value })
        if (!saved.ok) {
          setTopError(saved.errors.form ?? "Couldn't save the address. Uncheck save to continue.")
          return
        }
      }
      const r = await initiateCheckout({
        items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        voucherId,
        shippingAddress: v.value,
      })
      if (r.ok) {
        clearCart()
        window.location.href = r.redirectUrl
        return
      }
      if (r.error === "INVALID_ADDRESS" && r.details?.["fieldErrors"]) {
        setFieldErrors(r.details["fieldErrors"] as ShippingAddressErrors)
      } else {
        setTopError(CHECKOUT_USER_COPY[r.error])
      }
    })
  }

  if (!hydrated) {
    return <p className="text-sm text-gray-500">Loading cart…</p>
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
        <p className="text-sm text-gray-600">Your cart is empty.</p>
      </div>
    )
  }

  const availableVouchers =
    preview && "availableVouchers" in preview ? preview.availableVouchers : []
  const invalidLines = preview && "invalidLines" in preview ? preview.invalidLines : []

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Invalid lines warning */}
      {invalidLines.length > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <p className="mb-2 text-sm font-medium text-yellow-800">
            Some items in your cart can&apos;t be purchased:
          </p>
          <ul className="list-disc pl-5 text-sm text-yellow-700">
            {invalidLines.map((line) => (
              <li key={line.variantId}>
                {INVALID_LINE_COPY[line.reason] ?? "Unavailable"} (ID: {line.variantId.slice(0, 8)}
                …)
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Order summary */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-gray-900">Order summary</h2>
        {preview === null || isPending ? (
          <div className="animate-pulse space-y-2">
            <div className="h-4 w-3/4 rounded bg-gray-200" />
            <div className="h-4 w-1/2 rounded bg-gray-200" />
            <div className="h-4 w-2/3 rounded bg-gray-200" />
          </div>
        ) : preview.ok ? (
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {preview.storeRows.map((row) => (
              <div key={row.storeId} className="px-4 py-3 text-sm">
                <div className="flex justify-between text-gray-700">
                  <span>Subtotal</span>
                  <span>{formatMyrSen(Number(row.retailSubtotalSen))}</span>
                </div>
                {Number(row.brandDiscountSen) > 0 && (
                  <div className="flex justify-between text-green-700">
                    <span>Member discount</span>
                    <span>−{formatMyrSen(Number(row.brandDiscountSen))}</span>
                  </div>
                )}
                {Number(row.voucherContributionSen) > 0 && (
                  <div className="flex justify-between text-green-700">
                    <span>Voucher</span>
                    <span>−{formatMyrSen(Number(row.voucherContributionSen))}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600">
                  <span>Shipping</span>
                  <span>{formatMyrSen(Number(row.shippingFeeSen))}</span>
                </div>
              </div>
            ))}
            <div className="px-4 py-3 text-sm font-semibold">
              <div className="flex justify-between text-gray-900">
                <span>Total</span>
                <span>{formatMyrSen(Number(preview.totalBuyerPaysSen))}</span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-red-600">{CHECKOUT_USER_COPY[preview.error]}</p>
        )}
      </section>

      {/* Voucher */}
      {availableVouchers.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">Voucher</h2>
          <select
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
            value={voucherId ?? ""}
            onChange={(e) => setVoucherId(e.target.value || null)}
          >
            <option value="">No voucher</option>
            {availableVouchers.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </section>
      )}

      {/* Shipping address */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-gray-900">Shipping address</h2>
        {savedAddresses.length > 0 && (
          <div className="mb-4">
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className={inputClass(false)}
            >
              {savedAddresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {`${a.label ? `${a.label} — ` : ""}${a.line1}${a.isDefault ? " (default)" : ""}`}
                </option>
              ))}
              <option value="new">Use a new address</option>
            </select>
          </div>
        )}
        {selectedId !== "new" ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            {[
              address.name,
              address.phone,
              address.line1,
              address.line2,
              address.city,
              address.postcode,
              address.state,
            ]
              .filter(Boolean)
              .join(", ")}
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Full name" error={fieldErrors.name}>
              <input
                type="text"
                autoComplete="name"
                value={address.name}
                onChange={handleAddressField("name")}
                className={inputClass(!!fieldErrors.name)}
              />
            </Field>

            <Field label="Phone" error={fieldErrors.phone}>
              <input
                type="tel"
                autoComplete="tel"
                placeholder="+60123456789"
                value={address.phone}
                onChange={handleAddressField("phone")}
                className={inputClass(!!fieldErrors.phone)}
              />
            </Field>

            <Field label="Address line 1" error={fieldErrors.line1}>
              <input
                type="text"
                autoComplete="address-line1"
                value={address.line1}
                onChange={handleAddressField("line1")}
                className={inputClass(!!fieldErrors.line1)}
              />
            </Field>

            <Field label="Address line 2 (optional)" error={fieldErrors.line2}>
              <input
                type="text"
                autoComplete="address-line2"
                value={address.line2}
                onChange={handleAddressField("line2")}
                className={inputClass(!!fieldErrors.line2)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="City" error={fieldErrors.city}>
                <input
                  type="text"
                  autoComplete="address-level2"
                  value={address.city}
                  onChange={handleAddressField("city")}
                  className={inputClass(!!fieldErrors.city)}
                />
              </Field>

              <Field label="Postcode" error={fieldErrors.postcode}>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{5}"
                  maxLength={5}
                  autoComplete="postal-code"
                  value={address.postcode}
                  onChange={handleAddressField("postcode")}
                  className={inputClass(!!fieldErrors.postcode)}
                />
              </Field>
            </div>

            <Field label="State" error={fieldErrors.state}>
              <select
                autoComplete="address-level1"
                value={address.state}
                onChange={handleAddressField("state")}
                className={inputClass(!!fieldErrors.state)}
              >
                <option value="">Select state…</option>
                {MY_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={saveToBook}
                onChange={(e) => setSaveToBook(e.target.checked)}
              />
              Save this address to my book
            </label>
          </div>
        )}
      </section>

      {/* Top error banner */}
      {topError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{topError}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending && <Spinner />}
        {isPending ? "Processing…" : "Proceed to payment"}
      </button>
    </form>
  )
}

function inputClass(hasError: boolean) {
  return [
    "w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2",
    hasError ? "border-red-400 focus:ring-red-300" : "border-gray-300 focus:ring-gray-400",
  ].join(" ")
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string | undefined
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
