/**
 * Stage 5 PR #31 — Malaysian shipping address validator.
 *
 * Matches the codebase convention (no Zod): manual validation that
 * returns `{ ok: true, value }` or `{ ok: false, errors }` so callers
 * can render field-level messages.
 *
 * Used by /checkout server action AND the client form. Same module
 * imported on both sides so validation messages stay in sync.
 */

export type ShippingAddressInput = {
  name: string
  phone: string
  line1: string
  line2?: string
  city: string
  postcode: string
  state: MyState
  country: "MY"
}

/** Malaysian states + federal territories (16 total). */
export const MY_STATES = [
  "Johor",
  "Kedah",
  "Kelantan",
  "Melaka",
  "Negeri Sembilan",
  "Pahang",
  "Perak",
  "Perlis",
  "Pulau Pinang",
  "Sabah",
  "Sarawak",
  "Selangor",
  "Terengganu",
  "Kuala Lumpur",
  "Labuan",
  "Putrajaya",
] as const
export type MyState = (typeof MY_STATES)[number]

const MY_STATE_SET: ReadonlySet<string> = new Set(MY_STATES)

export type ShippingAddressErrors = Partial<Record<keyof ShippingAddressInput, string>>

export type ShippingAddressValidation =
  | { ok: true; value: ShippingAddressInput }
  | { ok: false; errors: ShippingAddressErrors }

const PHONE_RE = /^\+?60\d{8,10}$/
const POSTCODE_RE = /^\d{5}$/

export function validateShippingAddress(raw: unknown): ShippingAddressValidation {
  const errors: ShippingAddressErrors = {}
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, errors: { name: "Address is missing" } }
  }
  const o = raw as Record<string, unknown>

  const name = typeof o["name"] === "string" ? o["name"].trim() : ""
  if (!name) errors.name = "Name is required"
  else if (name.length > 120) errors.name = "Name must be at most 120 characters"

  const phone = typeof o["phone"] === "string" ? o["phone"].trim() : ""
  if (!phone) errors.phone = "Phone is required"
  else if (!PHONE_RE.test(phone))
    errors.phone = "Phone must be a Malaysian number (e.g. +60123456789)"

  const line1 = typeof o["line1"] === "string" ? o["line1"].trim() : ""
  if (!line1) errors.line1 = "Address line 1 is required"
  else if (line1.length > 200) errors.line1 = "Address line 1 must be at most 200 characters"

  const line2Raw = typeof o["line2"] === "string" ? o["line2"].trim() : undefined
  if (line2Raw !== undefined && line2Raw.length > 200) {
    errors.line2 = "Address line 2 must be at most 200 characters"
  }
  const line2 = line2Raw && line2Raw.length > 0 ? line2Raw : undefined

  const city = typeof o["city"] === "string" ? o["city"].trim() : ""
  if (!city) errors.city = "City is required"
  else if (city.length > 80) errors.city = "City must be at most 80 characters"

  const postcode = typeof o["postcode"] === "string" ? o["postcode"].trim() : ""
  if (!postcode) errors.postcode = "Postcode is required"
  else if (!POSTCODE_RE.test(postcode)) errors.postcode = "Postcode must be 5 digits"

  const stateRaw = typeof o["state"] === "string" ? o["state"] : ""
  if (!stateRaw) errors.state = "State is required"
  else if (!MY_STATE_SET.has(stateRaw)) errors.state = "State must be a Malaysian state"

  const country = o["country"]
  if (country !== "MY") errors.country = "Only Malaysia (MY) is supported"

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  const value: ShippingAddressInput = {
    name,
    phone,
    line1,
    city,
    postcode,
    state: stateRaw as MyState,
    country: "MY",
    ...(line2 ? { line2 } : {}),
  }
  return { ok: true, value }
}
