"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

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

  // Fulfillment toggle state for the edit-inline form
  const [editState, setEditState] = useState<EditState>({
    fulfillmentChecked: false,
    leadDays: "",
  })

  // Fulfillment toggle state for the "Add Variant" inline form
  const [addFulfillmentChecked, setAddFulfillmentChecked] = useState(false)
  const [addLeadDays, setAddLeadDays] = useState("")

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
      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Product Details</h2>
          <form action={updateProduct.bind(null, product.id)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label
                  htmlFor="name"
                  className="mb-1 block text-xs font-medium text-muted-foreground"
                >
                  Name *
                </Label>
                <Input id="name" name="name" required defaultValue={product.name} />
              </div>
              <div>
                <Label
                  htmlFor="slug"
                  className="mb-1 block text-xs font-medium text-muted-foreground"
                >
                  Slug
                </Label>
                <Input id="slug" name="slug" defaultValue={product.slug} className="font-mono" />
              </div>
              <div>
                <Label
                  htmlFor="categoryId"
                  className="mb-1 block text-xs font-medium text-muted-foreground"
                >
                  Category
                </Label>
                <select
                  id="categoryId"
                  name="categoryId"
                  defaultValue={product.categoryId ?? ""}
                  className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-primary focus:outline-none"
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
                <Label
                  htmlFor="status"
                  className="mb-1 block text-xs font-medium text-muted-foreground"
                >
                  Status
                </Label>
                <select
                  id="status"
                  name="status"
                  defaultValue={product.status}
                  className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div className="col-span-2">
                <Label
                  htmlFor="description"
                  className="mb-1 block text-xs font-medium text-muted-foreground"
                >
                  Description
                </Label>
                <Textarea
                  id="description"
                  name="description"
                  rows={3}
                  defaultValue={product.description ?? ""}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <SubmitButton className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                Save Changes
              </SubmitButton>
              {product.status !== "archived" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void archiveProduct(product.id)
                  }}
                  className="border-destructive/50 text-destructive hover:bg-destructive/10"
                >
                  Archive Product
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Variants ───────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Variants</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAddVariant(true)}
              className="text-xs text-primary border-primary/50 hover:bg-accent"
            >
              + Add Variant
            </Button>
          </div>

          <div className="space-y-2">
            {variants.map((v) =>
              editingVariantId === v.id ? (
                <form
                  key={v.id}
                  action={updateVariant.bind(null, v.id)}
                  onSubmit={() => setEditingVariantId(null)}
                  className="space-y-2 rounded-lg bg-accent p-3"
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
                      <Label
                        htmlFor={`edit_name_${v.id}`}
                        className="mb-1 block text-xs text-muted-foreground"
                      >
                        Name *
                      </Label>
                      <Input
                        id={`edit_name_${v.id}`}
                        name="name"
                        defaultValue={v.name}
                        required
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="w-24">
                      <Label
                        htmlFor={`edit_price_${v.id}`}
                        className="mb-1 block text-xs text-muted-foreground"
                      >
                        Price (RM) *
                      </Label>
                      <Input
                        id={`edit_price_${v.id}`}
                        name="price"
                        defaultValue={senToMyr(v.priceMyrSen)}
                        required
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="w-16">
                      <Label
                        htmlFor={`edit_stock_${v.id}`}
                        className="mb-1 block text-xs text-muted-foreground"
                      >
                        Stock
                      </Label>
                      <Input
                        id={`edit_stock_${v.id}`}
                        name="stock"
                        type="number"
                        min="0"
                        defaultValue={v.stockCount}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="w-24">
                      <Label
                        htmlFor={`edit_sku_${v.id}`}
                        className="mb-1 block text-xs text-muted-foreground"
                      >
                        SKU
                      </Label>
                      <Input
                        id={`edit_sku_${v.id}`}
                        name="sku"
                        defaultValue={v.sku ?? ""}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>

                  {/* Fulfillment row */}
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
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
                        <label className="text-xs text-muted-foreground">
                          Lead days (optional):
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={editState.leadDays}
                          onChange={(e) =>
                            setEditState((s) => ({ ...s, leadDays: e.target.value }))
                          }
                          placeholder="e.g. 14"
                          className="w-20 rounded border border-input px-2 py-1 text-xs focus:outline-none"
                        />
                        <span className="text-xs text-muted-foreground">days</span>
                      </div>
                    )}
                  </div>

                  <input type="hidden" name="attrs" value="" />

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <SubmitButton className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                      Save
                    </SubmitButton>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingVariantId(null)}
                      className="text-xs text-muted-foreground"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div
                  key={v.id}
                  className={cn(
                    "flex items-center justify-between rounded-lg border px-4 py-3",
                    v.isActive ? "border-border bg-muted" : "border-border bg-muted opacity-60",
                  )}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-foreground">{v.name}</span>
                    {v.sku && (
                      <span className="font-mono text-xs text-muted-foreground">SKU: {v.sku}</span>
                    )}
                    <span className="text-sm text-muted-foreground">
                      RM {senToMyr(v.priceMyrSen)}
                    </span>
                    <span className="text-xs text-muted-foreground">Stock: {v.stockCount}</span>
                    <FulfillmentBadge mode={v.fulfillmentMode} days={v.preorderLeadDays} />
                    {!v.isActive && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(v)}
                      className="text-xs text-primary hover:underline"
                    >
                      Edit
                    </button>
                    {v.isActive ? (
                      <button
                        type="button"
                        onClick={() => {
                          void deactivateVariant(v.id)
                        }}
                        className="text-xs text-destructive hover:underline"
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
              onSubmit={() => {
                setShowAddVariant(false)
                setAddFulfillmentChecked(false)
                setAddLeadDays("")
              }}
              className="mt-3 space-y-2 rounded-lg bg-green-50 p-3"
            >
              {/* Hidden fulfillment fields */}
              <input
                type="hidden"
                name="fulfillment_mode"
                value={
                  addFulfillmentChecked ? (addLeadDays.trim() ? "preorder" : "backorder") : "normal"
                }
              />
              <input
                type="hidden"
                name="preorder_lead_days"
                value={addFulfillmentChecked ? addLeadDays.trim() || "0" : "0"}
              />

              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label htmlFor="add_name" className="mb-1 block text-xs text-muted-foreground">
                    Name *
                  </Label>
                  <Input
                    id="add_name"
                    name="name"
                    required
                    autoFocus
                    placeholder="e.g. XL / Blue"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="w-24">
                  <Label htmlFor="add_price" className="mb-1 block text-xs text-muted-foreground">
                    Price (RM) *
                  </Label>
                  <Input
                    id="add_price"
                    name="price"
                    required
                    placeholder="0.00"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="w-16">
                  <Label htmlFor="add_stock" className="mb-1 block text-xs text-muted-foreground">
                    Stock
                  </Label>
                  <Input
                    id="add_stock"
                    name="stock"
                    type="number"
                    min="0"
                    defaultValue="0"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="w-24">
                  <Label htmlFor="add_sku" className="mb-1 block text-xs text-muted-foreground">
                    SKU
                  </Label>
                  <Input id="add_sku" name="sku" placeholder="optional" className="h-8 text-sm" />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={addFulfillmentChecked}
                    onChange={(e) => setAddFulfillmentChecked(e.target.checked)}
                    className="rounded"
                  />
                  Back-order / Pre-order
                </label>
                {addFulfillmentChecked && (
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs text-muted-foreground">Lead days (optional):</label>
                    <input
                      type="number"
                      min="1"
                      value={addLeadDays}
                      onChange={(e) => setAddLeadDays(e.target.value)}
                      placeholder="e.g. 14"
                      className="w-20 rounded border border-input px-2 py-1 text-xs focus:outline-none"
                    />
                    <span className="text-xs text-muted-foreground">days</span>
                  </div>
                )}
              </div>

              <input type="hidden" name="attrs" value="" />
              <div className="flex gap-2">
                <SubmitButton className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700">
                  Add
                </SubmitButton>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowAddVariant(false)
                    setAddFulfillmentChecked(false)
                    setAddLeadDays("")
                  }}
                  className="text-xs text-muted-foreground"
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
