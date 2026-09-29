/**
 * Validator for the /provider/apply form. No Zod, matches the codebase
 * convention (see shipping-address-schema.ts): manual validation returning
 * { ok: true, value } or { ok: false, errors }.
 */

export type ServiceProviderApplicationInput = {
  name: string
  contactEmail: string
  contactNumber: string
  companyName: string
  serviceCategoryId: string | null
  businessDescription: string | null
}

export type ServiceProviderApplicationErrors = Partial<
  Record<keyof ServiceProviderApplicationInput, string>
>

export type ServiceProviderApplicationValidation =
  | { ok: true; value: ServiceProviderApplicationInput }
  | { ok: false; errors: ServiceProviderApplicationErrors }

const EMAIL_RE = /^[^\s,;<>"@]+@[^\s,;<>"@]+\.[^\s,;<>"@]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validateServiceProviderApplication(
  raw: unknown,
): ServiceProviderApplicationValidation {
  const errors: ServiceProviderApplicationErrors = {}
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, errors: { name: "Application is missing" } }
  }
  const o = raw as Record<string, unknown>

  const name = typeof o["name"] === "string" ? o["name"].trim() : ""
  if (!name) errors.name = "Name is required"

  const contactEmail = typeof o["contactEmail"] === "string" ? o["contactEmail"].trim() : ""
  if (!contactEmail) errors.contactEmail = "Contact email is required"
  else if (!EMAIL_RE.test(contactEmail))
    errors.contactEmail = "Please provide a valid email address"

  const contactNumber = typeof o["contactNumber"] === "string" ? o["contactNumber"].trim() : ""
  if (!contactNumber) errors.contactNumber = "Contact number is required"

  const companyName = typeof o["companyName"] === "string" ? o["companyName"].trim() : ""
  if (!companyName) errors.companyName = "Company name is required"

  const categoryRaw =
    typeof o["serviceCategoryId"] === "string" ? o["serviceCategoryId"].trim() : ""
  const serviceCategoryId = categoryRaw.length > 0 ? categoryRaw : null
  if (serviceCategoryId !== null && !UUID_RE.test(serviceCategoryId)) {
    errors.serviceCategoryId = "Invalid category"
  }

  const descriptionRaw =
    typeof o["businessDescription"] === "string" ? o["businessDescription"].trim() : ""
  const businessDescription = descriptionRaw.length > 0 ? descriptionRaw : null

  // "Other" (no category) requires a description — mirrors the DB CHECK
  // constraint (0032) so this produces a friendly error, not a raw
  // constraint-violation 500.
  if (serviceCategoryId === null && businessDescription === null) {
    errors.businessDescription = 'Please describe your business, since you selected "Other"'
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
      name,
      contactEmail,
      contactNumber,
      companyName,
      serviceCategoryId,
      businessDescription,
    },
  }
}
