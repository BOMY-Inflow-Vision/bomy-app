"use server"

import { randomUUID } from "node:crypto"

import { eq, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { schema, withAdmin } from "@bomy/db"

import { authorizeAdminAction } from "@/lib/admin-action"
import { getDb } from "@/lib/db"
import { flashToast } from "@/lib/flash-toast-server"
import { getMailer } from "@/lib/mailer"
import { validateStoreProvisioning } from "@/lib/brand-story-validation"
import { sendApprovalEmail } from "@/notifications/seller-inquiry"

type ReviewResult = { ok: true } | { ok: false; error: string }

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

// Server-form trigger (no client JS runs after submit) — must not throw for an expected
// failure; flashes a toast for both outcomes itself instead of returning a result.
export async function deleteInquiry(inquiryId: string): Promise<void> {
  const authz = await authorizeAdminAction()
  if (!authz.ok) {
    await flashToast("error", authz.error)
    return
  }

  try {
    await withAdmin(
      getDb(),
      { userId: authz.adminId, reason: "admin delete seller inquiry" },
      async (tx) => {
        await tx.delete(schema.sellerInquiries).where(eq(schema.sellerInquiries.id, inquiryId))
      },
    )
  } catch {
    await flashToast("error", "Could not delete inquiry.")
    return
  }

  revalidatePath("/seller-inquiries")
  await flashToast("success", "Inquiry deleted.")
}

type ApprovePayload = { email: string; name: string | null; storeName: string; finalSlug: string }

export async function approveInquiry(
  inquiryId: string,
  slug: string,
  bodyHtml: string,
  videoUrl: string,
): Promise<ReviewResult> {
  const authz = await authorizeAdminAction()
  if (!authz.ok) return { ok: false, error: authz.error }
  const adminId = authz.adminId

  const storeId = randomUUID()
  const validated = await validateStoreProvisioning(bodyHtml, videoUrl, storeId)
  if (!validated.ok) return { ok: false, error: validated.error }
  const { bodyHtml: finalBodyHtml, videoId } = validated

  let result: ReviewResult | ApprovePayload
  try {
    result = await withAdmin(
      getDb(),
      { userId: adminId, reason: "admin approve seller inquiry" },
      async (tx): Promise<ReviewResult | ApprovePayload> => {
        // 1. Lock + read the inquiry.
        const [inquiry] = await tx
          .select({
            id: schema.sellerInquiries.id,
            name: schema.sellerInquiries.name,
            email: schema.sellerInquiries.email,
            storeName: schema.sellerInquiries.storeName,
            status: schema.sellerInquiries.status,
          })
          .from(schema.sellerInquiries)
          .where(eq(schema.sellerInquiries.id, inquiryId))
          .for("update")
          .limit(1)
        if (!inquiry) return { ok: false, error: "Inquiry not found" }

        // 2. Status gate (idempotency).
        if (inquiry.status !== "pending") return { ok: false, error: "Already reviewed" }

        // 3. Resolve owner by email, locked FOR UPDATE.
        const [owner] = await tx
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(sql`lower(${schema.users.email}) = lower(${inquiry.email})`)
          .for("update")
          .limit(1)
        if (!owner) {
          return {
            ok: false,
            error: `No user account for ${inquiry.email} — applicant must sign in once before approval`,
          }
        }

        // 3.5. One-store-per-owner guard.
        const existingStore = await tx
          .select({ id: schema.stores.id })
          .from(schema.stores)
          .where(eq(schema.stores.ownerId, owner.id))
          .limit(1)
        if (existingStore.length > 0) {
          return { ok: false, error: "Applicant already owns a store" }
        }

        // 4. Slug normalize + collision-suffix loop.
        const base = slugify(slug) || slugify(inquiry.storeName) || "store"
        let candidate = base
        let n = 2
        let taken = await tx
          .select({ id: schema.stores.id })
          .from(schema.stores)
          .where(eq(schema.stores.slug, candidate))
          .limit(1)
        while (taken.length > 0) {
          candidate = `${base}-${n++}`
          taken = await tx
            .select({ id: schema.stores.id })
            .from(schema.stores)
            .where(eq(schema.stores.slug, candidate))
            .limit(1)
        }
        const finalSlug = candidate

        // 5. Insert store (status=pending; no role flip here — that happens at /stores approveStore).
        // id/bodyHtml/videoId supplied together in one INSERT — never insert first and update
        // after, since a bad partial store would otherwise commit if this transaction returned
        // early instead of throwing.
        const [newStore] = await tx
          .insert(schema.stores)
          .values({
            id: storeId,
            ownerId: owner.id,
            name: inquiry.storeName,
            slug: finalSlug,
            status: "pending",
            bodyHtml: finalBodyHtml,
            videoId,
          })
          .returning({ id: schema.stores.id })

        // 6. Stamp inquiry.
        await tx
          .update(schema.sellerInquiries)
          .set({
            status: "approved",
            storeId: newStore!.id,
            reviewedBy: adminId,
            reviewedAt: new Date(),
          })
          .where(eq(schema.sellerInquiries.id, inquiryId))

        // 7. Carry the email payload out of the transaction.
        return { email: inquiry.email, name: inquiry.name, storeName: inquiry.storeName, finalSlug }
      },
    )
  } catch (err) {
    // Postgres 23505 = unique_violation (slug raced past our pre-check).
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      return { ok: false, error: "Store slug already taken — try another" }
    }
    throw err
  }

  // ReviewResult always has `ok`; ApprovePayload never does — `in` narrows cleanly.
  if ("ok" in result) return result
  const payload = result

  // 8. Send email after tx (await + catch; not fire-and-forget).
  try {
    await sendApprovalEmail(
      getMailer(),
      {
        name: payload.name,
        email: payload.email,
        storeName: payload.storeName,
        storeSlug: payload.finalSlug,
      },
      { appUrl: process.env["APP_URL"] ?? "" },
    )
  } catch (err) {
    console.error({
      event: "email_notification_failed",
      inquiryId,
      message: err instanceof Error ? err.message : String(err),
    })
  }

  revalidatePath("/seller-inquiries")
  revalidatePath("/stores")
  return { ok: true }
}

export async function rejectInquiry(inquiryId: string): Promise<ReviewResult> {
  const authz = await authorizeAdminAction()
  if (!authz.ok) return { ok: false, error: authz.error }
  const adminId = authz.adminId

  const result = await withAdmin(
    getDb(),
    { userId: adminId, reason: "admin reject seller inquiry" },
    async (tx): Promise<ReviewResult> => {
      const [inquiry] = await tx
        .select({ id: schema.sellerInquiries.id, status: schema.sellerInquiries.status })
        .from(schema.sellerInquiries)
        .where(eq(schema.sellerInquiries.id, inquiryId))
        .for("update")
        .limit(1)
      if (!inquiry) return { ok: false, error: "Inquiry not found" }
      if (inquiry.status !== "pending") return { ok: false, error: "Already reviewed" }

      await tx
        .update(schema.sellerInquiries)
        .set({ status: "rejected", reviewedBy: adminId, reviewedAt: new Date() })
        .where(eq(schema.sellerInquiries.id, inquiryId))
      return { ok: true }
    },
  )

  if (result.ok) revalidatePath("/seller-inquiries")
  return result
}
