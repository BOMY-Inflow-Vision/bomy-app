"use server"

import { and, eq } from "drizzle-orm"
import { after } from "next/server"

import { checkActionRateLimit, makeDb, schema, withTenant } from "@bomy/db"
import { parseOpsEmails } from "@bomy/mailer"

import { auth } from "@/auth"
import { getMailer } from "@/lib/mailer"
import { ACTION_RATE_LIMITS, RATE_LIMIT_USER_MESSAGE } from "@/lib/rate-limits"
import {
  validateServiceProviderApplication,
  type ServiceProviderApplicationErrors,
} from "@/lib/service-provider-application-schema"
import { sendApplicantAck, sendOpsAlert } from "@/notifications/service-provider-application"

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

export type SubmitProviderApplicationResult =
  | { ok: true }
  | {
      ok: false
      errors: ServiceProviderApplicationErrors & {
        form?: string
        code?: "already_applied" | "rate_limited" | "inactive_category"
      }
    }

const INACTIVE_CATEGORY_CODE = "INACTIVE_CATEGORY"

function isUniqueViolation(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: unknown }).code === "23505"
  )
}

function isInactiveCategory(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: unknown }).code === INACTIVE_CATEGORY_CODE
  )
}

function readFormString(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

export async function submitProviderApplication(
  formData: FormData,
): Promise<SubmitProviderApplicationResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { ok: false, errors: { form: "Please sign in first." } }
  }
  const userId = session.user.id
  const userRole = session.user.role

  const limit = await checkActionRateLimit(
    getDb(),
    { userId, userRole },
    "service_provider_apply",
    ACTION_RATE_LIMITS.serviceProviderApply,
  )
  if (!limit.allowed) {
    return { ok: false, errors: { form: RATE_LIMIT_USER_MESSAGE, code: "rate_limited" } }
  }

  const categoryRaw = readFormString(formData, "serviceCategoryId")
  const validation = validateServiceProviderApplication({
    name: readFormString(formData, "name"),
    contactEmail: readFormString(formData, "contactEmail"),
    contactNumber: readFormString(formData, "contactNumber"),
    companyName: readFormString(formData, "companyName"),
    serviceCategoryId: categoryRaw.length > 0 ? categoryRaw : null,
    businessDescription: readFormString(formData, "businessDescription") || null,
  })
  if (!validation.ok) return { ok: false, errors: validation.errors }
  const input = validation.value

  try {
    const { applicationId, email, categoryLabel } = await withTenant(
      getDb(),
      { userId, userRole },
      async (tx) => {
        let categoryLabel = "Other"
        if (input.serviceCategoryId) {
          const [category] = await tx
            .select({ id: schema.serviceCategories.id, name: schema.serviceCategories.name })
            .from(schema.serviceCategories)
            .where(
              and(
                eq(schema.serviceCategories.id, input.serviceCategoryId),
                eq(schema.serviceCategories.isActive, true),
              ),
            )
          if (!category) {
            throw Object.assign(new Error("Category is no longer active"), {
              code: INACTIVE_CATEGORY_CODE,
            })
          }
          categoryLabel = category.name
        }

        const [inserted] = await tx
          .insert(schema.serviceProviderApplications)
          .values({
            applicantUserId: userId,
            name: input.name,
            contactEmail: input.contactEmail,
            contactNumber: input.contactNumber,
            companyName: input.companyName,
            serviceCategoryId: input.serviceCategoryId,
            businessDescription: input.businessDescription,
          })
          .returning({ id: schema.serviceProviderApplications.id })

        // Read the account's CURRENT email fresh from `users`, inside this same
        // transaction — never the session/JWT's cached claim, which can be
        // stale for up to 30 days or diverge if an admin changes the row after
        // sign-in (spec §6). This is the actual fix for that bug, not the mock
        // in the test alone.
        const [user] = await tx
          .select({ email: schema.users.email })
          .from(schema.users)
          .where(eq(schema.users.id, userId))
        if (!user) throw new Error("submitProviderApplication: signed-in user row not found")

        return { applicationId: inserted!.id, email: user.email, categoryLabel }
      },
    )

    // Dispatch after the response returns: this is a request path (a server
    // action returning to the signed-in browser), so SMTP must never add to
    // the response latency, and neither email's outcome changes the
    // `{ ok: true }` returned below. A bare `void sendX(...).catch(log)` is
    // NOT enough on Vercel — once the response is sent, the invocation can be
    // frozen or torn down before an unawaited promise finishes (see
    // https://vercel.com/kb/guide/troubleshooting-inconsistent-logs-in-vercel-functions).
    // `after()` extends the invocation via `waitUntil` so the send actually
    // completes, matching the existing precedent in
    // seller/dashboard/products/actions.ts and .../settings/body-actions.ts.
    const mailer = getMailer()
    after(async () => {
      try {
        await sendApplicantAck(mailer, { name: input.name, email })
      } catch (err) {
        console.error({
          event: "email_notification_failed",
          recipientType: "applicant",
          applicationId,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    })

    const opsEmails = parseOpsEmails(process.env)
    if (opsEmails.length === 0) {
      console.info({
        event: "email_notification_skipped",
        reason: "missing_ops_recipients",
        applicationId,
      })
      return { ok: true }
    }

    after(async () => {
      try {
        await sendOpsAlert(
          mailer,
          {
            applicationId,
            name: input.name,
            contactEmail: input.contactEmail,
            contactNumber: input.contactNumber,
            companyName: input.companyName,
            category: categoryLabel,
            businessDescription: input.businessDescription,
          },
          { opsEmails },
        )
      } catch (err) {
        console.error({
          event: "email_notification_failed",
          recipientType: "ops",
          applicationId,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    })

    return { ok: true }
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        ok: false,
        errors: { form: "You already have an application on file.", code: "already_applied" },
      }
    }
    if (isInactiveCategory(err)) {
      return {
        ok: false,
        errors: {
          serviceCategoryId: "That category is no longer available. Please pick another.",
          code: "inactive_category",
        },
      }
    }
    throw err
  }
}
