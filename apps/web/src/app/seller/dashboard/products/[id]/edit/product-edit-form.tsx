"use client"

import { useState } from "react"

import {
  addVariant,
  archiveProduct,
  deactivateVariant,
  reactivateVariant,
  updateProduct,
  updateVariant,
} from "../../actions"
import { SubmitButton } from "@/components/submit-button"

type Category = { id: string; name: string; isActive: boolean }
type Product = {
  id: string
  name: string
  slug: string
  description: string | null
  categoryId: string | null
  status: "draft" | "active" | "archived"
}
type Variant = {
  id: string
  name: string
  priceMyrSen: bigint
  stockCount: number
  sku: string | null
  attributes: unknown
  isActive: boolean
  fulfillmentMode: string
  preorderLeadDays: number | null
}

function senToMyr(sen: bigint): string {
  const whole = sen / 100n
  const frac = String(sen % 100n).padStart(2, "0")
  return `${whole}.${frac}`
}

function FulfillmentBadge({ mode, days }: { mode: string; days: number | null }) {
  if (mode === "backorder") {
    return (
      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">
        Back-order
      </span>
    )
  }
  if (mode === "preorder") {
    return (
      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
        Pre-order{days ? ` · ${days}d` : ""}
      </span>
    )
  }
  return null
}

type EditState = {
  fulfillmentChecked: boolean
  leadDays: string
}

export function ProductEditForm({
  product,
  variants,
  categories,
}: {
  product: Product
  variants: Variant[]
  categories: Category[]
}) {
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null)
  const [showAddVariant, setShowAddVariant] = useState(false)

  // Per-variant edit state for the fulfillment toggle
  const [editState, setEditState] = useState<EditState>({
    fulfillmentChecked: false,
    leadDays: "",
  })

  function openEdit(v: Variant) {
    const isSpecial = v.fulfillmentMode === "backorder" || v.fulfillmentMode === "preorder"
    setEditState({
      fulfillmentChecked: isSpecial,
      leadDays: v.preorderLeadDays != null ? String(v.preorderLeadDays) : "",
    })
    setEditingVariantId(v.id)
  }

  return (
    <div className="space-y-6">
      {/* ── Product fields ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Product Details</h2>
        <form action={updateProduct.bind(null, product.id)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Name *</label>
              <input
                name="name"
                required
                defaultValue={product.name}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Slug</label>
              <input
                name="slug"
                defaultValue={product.slug}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Category</label>
              <select
                name="categoryId"
                defaultValue={product.categoryId ?? ""}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {!c.isActive ? " (inactive)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Status</label>
              <select
                name="status"
                defaultValue={product.status}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-600">Description</label>
              <textarea
                name="description"
                rows={3}
                defaultValue={product.description ?? ""}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <SubmitButton className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700">
              Save Changes
            </SubmitButton>
            {product.status !== "archived" && (
              <button
                type="button"
                onClick={() => {
                  void archiveProduct(product.id)
                }}
                className="rounded-lg border border-red-300 px-5 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Archive Product
              </button>
            )}
          </div>
        </form>
      </div>

      {/* ── Variants ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Variants</h2>
          <button
            type="button"
            onClick={() => setShowAddVariant(true)}
            className="rounded-lg border border-indigo-300 px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
          >
            + Add Variant
          </button>
        </div>

        <div className="space-y-2">
          {variants.map((v) =>
            editingVariantId === v.id ? (
              <form
                key={v.id}
                action={updateVariant.bind(null, v.id)}
                onSubmit={() => setEditingVariantId(null)}
                className="space-y-2 rounded-lg bg-indigo-50 p-3"
              >
                {/* Hidden fulfillment fields driven by client state */}
                <input
                  type="hidden"
                  name="fulfillment_mode"
                  value={
                    editState.fulfillmentChecked
                      ? editState.leadDays.trim()
                        ? "preorder"
                        : "backorder"
                      : "normal"
                  }
                />
                <input
                  type="hidden"
                  name="preorder_lead_days"
                  value={editState.fulfillmentChecked ? editState.leadDays.trim() || "0" : "0"}
                />

                {/* Main fields row */}
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs text-gray-500">Name *</label>
                    <input
                      name="name"
                      defaultValue={v.name}
                      required
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none"
                    />
                  </div>
                  <div className="w-24">
                    <label className="mb-1 block text-xs text-gray-500">Price (RM) *</label>
                    <input
                      name="price"
                      defaultValue={senToMyr(v.priceMyrSen)}
                      required
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none"
                    />
                  </div>
                  <div className="w-16">
                    <label className="mb-1 block text-xs text-gray-500">Stock</label>
                    <input
                      name="stock"
                      type="number"
                      min="0"
                      defaultValue={v.stockCount}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none"
                    />
                  </div>
                  <div className="w-24">
                    <label className="mb-1 block text-xs text-gray-500">SKU</label>
                    <input
                      name="sku"
                      defaultValue={v.sku ?? ""}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none"
                    />
                  </div>
                </div>

                {/* Fulfillment row */}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={editState.fulfillmentChecked}
                      onChange={(e) =>
                        setEditState((s) => ({ ...s, fulfillmentChecked: e.target.checked }))
                      }
                      className="rounded"
                    />
                    Back-order / Pre-order
                  </label>
                  {editState.fulfillmentChecked && (
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-gray-500">Lead days (optional):</label>
                      <input
                        type="number"
                        min="1"
                        value={editState.leadDays}
                        onChange={(e) => setEditState((s) => ({ ...s, leadDays: e.target.value }))}
                        placeholder="e.g. 14"
                        className="w-20 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none"
                      />
                      <span className="text-xs text-gray-400">days</span>
                    </div>
                  )}
                </div>

                <input type="hidden" name="attrs" value="" />

                {/* Action buttons */}
                <div className="flex gap-2">
                  <SubmitButton className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700">
                    Save
                  </SubmitButton>
                  <button
                    type="button"
                    onClick={() => setEditingVariantId(null)}
                    className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div
                key={v.id}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 ${v.isActive ? "border-gray-200 bg-gray-50" : "border-gray-100 bg-gray-50 opacity-60"}`}
              >
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-gray-900">{v.name}</span>
                  {v.sku && <span className="font-mono text-xs text-gray-400">SKU: {v.sku}</span>}
                  <span className="text-sm text-gray-600">RM {senToMyr(v.priceMyrSen)}</span>
                  <span className="text-xs text-gray-500">Stock: {v.stockCount}</span>
                  <FulfillmentBadge mode={v.fulfillmentMode} days={v.preorderLeadDays} />
                  {!v.isActive && (
                    <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-500">
                      Inactive
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(v)}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    Edit
                  </button>
                  {v.isActive ? (
                    <button
                      type="button"
                      onClick={() => {
                        void deactivateVariant(v.id)
                      }}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        void reactivateVariant(v.id)
                      }}
                      className="text-xs text-green-600 hover:underline"
                    >
                      Activate
                    </button>
                  )}
                </div>
              </div>
            ),
          )}
        </div>

        {/* Add variant inline form */}
        {showAddVariant && (
          <form
            action={addVariant.bind(null, product.id)}
            onSubmit={() => setShowAddVariant(false)}
            className="mt-3 flex items-end gap-2 rounded-lg bg-green-50 p-3"
          >
            <div className="flex-1">
              <label className="mb-1 block text-xs text-gray-500">Name *</label>
              <input
                name="name"
                required
                autoFocus
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none"
                placeholder="e.g. XL / Blue"
              />
            </div>
            <div className="w-24">
              <label className="mb-1 block text-xs text-gray-500">Price (RM) *</label>
              <input
                name="price"
                required
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none"
                placeholder="0.00"
              />
            </div>
            <div className="w-16">
              <label className="mb-1 block text-xs text-gray-500">Stock</label>
              <input
                name="stock"
                type="number"
                min="0"
                defaultValue="0"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none"
              />
            </div>
            <div className="w-24">
              <label className="mb-1 block text-xs text-gray-500">SKU</label>
              <input
                name="sku"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none"
                placeholder="optional"
              />
            </div>
            <input type="hidden" name="attrs" value="" />
            <SubmitButton className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700">
              Add
            </SubmitButton>
            <button
              type="button"
              onClick={() => setShowAddVariant(false)}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100"
            >
              Cancel
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
