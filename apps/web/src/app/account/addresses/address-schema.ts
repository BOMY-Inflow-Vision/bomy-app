import {
  validateShippingAddress,
  type ShippingAddressErrors,
  type ShippingAddressInput,
} from "@/lib/shipping-address-schema"

export type AddressBookInput = { label: string | null } & ShippingAddressInput
export type AddressBookValue = { label: string | null } & ShippingAddressInput
export type AddressBookErrors = ShippingAddressErrors & { label?: string }

export type AddressBookResult =
  | { ok: true; value: AddressBookValue }
  | { ok: false; errors: AddressBookErrors }

const MAX_LABEL = 40

export function validateAddressBookEntry(input: AddressBookInput): AddressBookResult {
  const errors: AddressBookErrors = {}

  const label = (input.label ?? "").trim()
  if (label.length > MAX_LABEL) errors.label = `Label must be ${MAX_LABEL} characters or fewer`

  const address = validateShippingAddress(input)
  if (!address.ok) return { ok: false, errors: { ...address.errors, ...errors } }
  if (errors.label) return { ok: false, errors }

  return { ok: true, value: { ...address.value, label: label === "" ? null : label } }
}
