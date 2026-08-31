/**
 * Shared SEO field validator (metaTitle/metaDescription/ogImageUrl), used by
 * both apps/web (seller) and apps/admin. Matches the codebase convention (no
 * Zod): manual validation returning `{ ok: true, value }` or
 * `{ ok: false, errors }`, mirroring apps/web/src/lib/shipping-address-schema.ts.
 */

export type SeoFieldsInput = {
  metaTitle?: unknown
  metaDescription?: unknown
  ogImageUrl?: unknown
}

export type SeoFieldsValue = {
  metaTitle: string | null
  metaDescription: string | null
  ogImageUrl: string | null
}

export type SeoFieldsErrors = Partial<Record<keyof SeoFieldsValue, string>>

export type SeoFieldsValidation =
  | { ok: true; value: SeoFieldsValue }
  | { ok: false; errors: SeoFieldsErrors }

const META_TITLE_MAX = 70
const META_DESCRIPTION_MAX = 160
const OG_IMAGE_URL_MAX = 2048

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

export function validateSeoFields(raw: unknown): SeoFieldsValidation {
  const errors: SeoFieldsErrors = {}
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, errors: { metaTitle: "Invalid input" } }
  }
  const o = raw as Record<string, unknown>

  const metaTitle = str(o["metaTitle"])
  if (metaTitle.length > META_TITLE_MAX) {
    errors.metaTitle = `Meta title must be ${META_TITLE_MAX} characters or fewer`
  }

  const metaDescription = str(o["metaDescription"])
  if (metaDescription.length > META_DESCRIPTION_MAX) {
    errors.metaDescription = `Meta description must be ${META_DESCRIPTION_MAX} characters or fewer`
  }

  const ogImageUrlRaw = str(o["ogImageUrl"])
  let ogImageUrl: string | null = null
  if (ogImageUrlRaw.length > 0) {
    if (ogImageUrlRaw.length > OG_IMAGE_URL_MAX) {
      errors.ogImageUrl = `OG image URL must be ${OG_IMAGE_URL_MAX} characters or fewer`
    } else {
      try {
        const u = new URL(ogImageUrlRaw)
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          errors.ogImageUrl = "OG image URL must start with http:// or https://"
        } else {
          ogImageUrl = ogImageUrlRaw
        }
      } catch {
        errors.ogImageUrl = "OG image URL must be a valid absolute URL"
      }
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
      metaTitle: metaTitle.length > 0 ? metaTitle : null,
      metaDescription: metaDescription.length > 0 ? metaDescription : null,
      ogImageUrl,
    },
  }
}
