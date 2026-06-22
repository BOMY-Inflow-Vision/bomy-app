"use server"

import { and, eq, ne, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { makeDb, schema, withTenant } from "@bomy/db"

import { auth } from "@/auth"

import {
  validateAddressBookEntry,
  type AddressBookErrors,
  type AddressBookInput,
} from "./address-schema"

const MAX_ADDRESSES = 20
const PATH = "/account/addresses"

let _client: ReturnType<typeof makeDb> | null = null
function getDb() {
  if (!_client) _client = makeDb()
  return _client.db
}

type Result = { ok: true } | { ok: false; errors: AddressBookErrors & { form?: string } }
type Tx = Parameters<Parameters<typeof withTenant>[2]>[0]

async function requireUser() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")
  return { id: session.user.id, role: session.user.role }
}

async function lockUser(tx: Tx, userId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('address_book:' || ${userId}::text))`)
}

export async function listAddresses() {
  const user = await requireUser().catch(() => null)
  if (!user) return []
  return withTenant(getDb(), { userId: user.id, userRole: user.role }, (tx) =>
    tx
      .select()
      .from(schema.userAddresses)
      .where(eq(schema.userAddresses.userId, user.id))
      .orderBy(
        sql`${schema.userAddresses.isDefault} desc`,
        sql`${schema.userAddresses.updatedAt} desc`,
      ),
  )
}

export async function addAddress(input: AddressBookInput): Promise<Result> {
  const user = await requireUser()
  const parsed = validateAddressBookEntry(input)
  if (!parsed.ok) return { ok: false, errors: parsed.errors }
  const v = parsed.value

  return withTenant(getDb(), { userId: user.id, userRole: user.role }, async (tx) => {
    await lockUser(tx, user.id)
    const existing = await tx
      .select({ id: schema.userAddresses.id })
      .from(schema.userAddresses)
      .where(eq(schema.userAddresses.userId, user.id))
    if (existing.length >= MAX_ADDRESSES) {
      return { ok: false, errors: { form: `You can save up to ${MAX_ADDRESSES} addresses.` } }
    }
    await tx.insert(schema.userAddresses).values({
      userId: user.id,
      label: v.label,
      recipientName: v.name,
      phone: v.phone,
      line1: v.line1,
      line2: v.line2 ?? null,
      city: v.city,
      postcode: v.postcode,
      state: v.state,
      country: "MY",
      isDefault: existing.length === 0,
    })
    revalidatePath(PATH)
    return { ok: true }
  })
}

export async function updateAddress(addressId: string, input: AddressBookInput): Promise<Result> {
  const user = await requireUser()
  const parsed = validateAddressBookEntry(input)
  if (!parsed.ok) return { ok: false, errors: parsed.errors }
  const v = parsed.value

  return withTenant(getDb(), { userId: user.id, userRole: user.role }, async (tx) => {
    await lockUser(tx, user.id)
    const res = await tx
      .update(schema.userAddresses)
      .set({
        label: v.label,
        recipientName: v.name,
        phone: v.phone,
        line1: v.line1,
        line2: v.line2 ?? null,
        city: v.city,
        postcode: v.postcode,
        state: v.state,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.userAddresses.id, addressId), eq(schema.userAddresses.userId, user.id)))
      .returning({ id: schema.userAddresses.id })
    if (res.length === 0) return { ok: false, errors: { form: "Address not found" } }
    revalidatePath(PATH)
    return { ok: true }
  })
}

export async function deleteAddress(addressId: string): Promise<{ ok: true }> {
  const user = await requireUser()
  await withTenant(getDb(), { userId: user.id, userRole: user.role }, async (tx) => {
    await lockUser(tx, user.id)
    await tx
      .delete(schema.userAddresses)
      .where(and(eq(schema.userAddresses.id, addressId), eq(schema.userAddresses.userId, user.id)))
  })
  revalidatePath(PATH)
  return { ok: true }
}

export async function setDefault(addressId: string): Promise<Result> {
  const user = await requireUser()
  return withTenant(getDb(), { userId: user.id, userRole: user.role }, async (tx) => {
    await lockUser(tx, user.id)
    const [target] = await tx
      .select({ id: schema.userAddresses.id })
      .from(schema.userAddresses)
      .where(and(eq(schema.userAddresses.id, addressId), eq(schema.userAddresses.userId, user.id)))
    if (!target) return { ok: false, errors: { form: "Address not found" } }

    await tx
      .update(schema.userAddresses)
      .set({ isDefault: false })
      .where(and(eq(schema.userAddresses.userId, user.id), ne(schema.userAddresses.id, addressId)))
    await tx
      .update(schema.userAddresses)
      .set({ isDefault: true })
      .where(eq(schema.userAddresses.id, addressId))
    revalidatePath(PATH)
    return { ok: true }
  })
}
