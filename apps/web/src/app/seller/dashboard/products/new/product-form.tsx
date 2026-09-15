"use client"

import { type FormEvent, useActionState, useEffect, useState, useTransition } from "react"

import { useToast } from "@/components/toaster"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import { createProduct, type ProductActionResult } from "../actions"

async function formAction(
  _prev: ProductActionResult | null,
  formData: FormData,
): Promise<ProductActionResult> {
  return createProduct(formData)
}

type Category = { id: string; name: string }

type VariantRow = {
  id: number
  name: string
  price: string
  stock: string
  sku: string
  attrs: string
  fulfillmentChecked: boolean
  leadDays: string
}

export function ProductForm({ categories }: { categories: Category[] }) {
  const [state, dispatch, pending] = useActionState(formAction, null)
  const [, startTransition] = useTransition()
  const toast = useToast()
  const [variants, setVariants] = useState<VariantRow[]>([
    {
      id: 0,
      name: "",
      price: "",
      stock: "0",
      sku: "",
      attrs: "",
      fulfillmentChecked: false,
      leadDays: "",
    },
  ])
  const [nameVal, setNameVal] = useState("")

  function slugify(s: string) {
    return s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
  }

  function addVariant() {
    setVariants((prev) => [
      ...prev,
      {
        id: Date.now(),
        name: "",
        price: "",
        stock: "0",
        sku: "",
        attrs: "",
        fulfillmentChecked: false,
        leadDays: "",
      },
    ])
  }

  function removeVariant(id: number) {
    setVariants((prev) => prev.filter((v) => v.id !== id))
  }

  function updateVariantField(id: number, field: keyof VariantRow, value: string | boolean) {
    setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, [field]: value } : v)))
  }

  // Toast on every result. Depend on the whole `state` object (not a field) —
  // useActionState returns a fresh object per invocation, but the error string
  // can repeat across consecutive failures, so a field dependency wouldn't re-fire.
  useEffect(() => {
    if (!state) return
    if (!state.ok) toast.error(state.error)
  }, [state, toast])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    // Dispatched manually rather than via <form action>: React 19 resets uncontrolled
    // fields after a form action completes even when it returns an error, which would
    // wipe out everything the seller just typed.
    startTransition(() => dispatch(formData))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Hidden: variant count */}
      <input type="hidden" name="variant_count" value={variants.length} />

      {state && !state.ok && (
        <div
          role="alert"
          className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {state.error}
        </div>
      )}

      {/* Product fields */}
      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Product Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label
                htmlFor="name"
                className="mb-1 block text-xs font-medium text-muted-foreground"
              >
                Name *
              </Label>
              <Input
                id="name"
                name="name"
                required
                value={nameVal}
                onChange={(e) => setNameVal(e.target.value)}
                placeholder="e.g. Handmade Tote Bag"
              />
            </div>
            <div>
              <Label
                htmlFor="slug"
                className="mb-1 block text-xs font-medium text-muted-foreground"
              >
                Slug (auto-generated if empty)
              </Label>
              <Input
                id="slug"
                name="slug"
                className="font-mono text-muted-foreground"
                placeholder={slugify(nameVal) || "auto-generated"}
              />
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
                className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-primary focus:outline-none"
              >
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
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
                defaultValue="draft"
                className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-primary focus:outline-none"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
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
                placeholder="Describe your product"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Variants */}
      <Card>
        <CardContent className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Variants *</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addVariant}
              className="text-xs text-primary border-primary/50 hover:bg-accent"
            >
              + Add Variant
            </Button>
          </div>

          <div className="space-y-4">
            {variants.map((v, idx) => {
              const fulfillmentMode = v.fulfillmentChecked
                ? v.leadDays.trim()
                  ? "preorder"
                  : "backorder"
                : "normal"
              const leadDays = v.fulfillmentChecked ? v.leadDays.trim() || "0" : "0"

              return (
                <div key={v.id} className="rounded-lg border border-border bg-muted p-3">
                  {/* Hidden indexed fields */}
                  <input type="hidden" name={`variant_attrs_${idx}`} value={v.attrs} />
                  <input
                    type="hidden"
                    name={`variant_fulfillment_mode_${idx}`}
                    value={fulfillmentMode}
                  />
                  <input
                    type="hidden"
                    name={`variant_preorder_lead_days_${idx}`}
                    value={leadDays}
                  />

                  {/* Main fields */}
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label
                        htmlFor={`variant_name_${idx}`}
                        className="mb-1 block text-xs text-muted-foreground"
                      >
                        Name *
                      </Label>
                      <Input
                        id={`variant_name_${idx}`}
                        name={`variant_name_${idx}`}
                        value={v.name}
                        onChange={(e) => updateVariantField(v.id, "name", e.target.value)}
                        required
                        placeholder="e.g. Small / Red"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="w-28">
                      <Label
                        htmlFor={`variant_price_${idx}`}
                        className="mb-1 block text-xs text-muted-foreground"
                      >
                        Price (RM) *
                      </Label>
                      <Input
                        id={`variant_price_${idx}`}
                        name={`variant_price_${idx}`}
                        value={v.price}
                        onChange={(e) => updateVariantField(v.id, "price", e.target.value)}
                        required
                        placeholder="0.00"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="w-20">
                      <Label
                        htmlFor={`variant_stock_${idx}`}
                        className="mb-1 block text-xs text-muted-foreground"
                      >
                        Stock
                      </Label>
                      <Input
                        id={`variant_stock_${idx}`}
                        name={`variant_stock_${idx}`}
                        type="number"
                        min="0"
                        value={v.stock}
                        onChange={(e) => updateVariantField(v.id, "stock", e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="w-28">
                      <Label
                        htmlFor={`variant_sku_${idx}`}
                        className="mb-1 block text-xs text-muted-foreground"
                      >
                        SKU
                      </Label>
                      <Input
                        id={`variant_sku_${idx}`}
                        name={`variant_sku_${idx}`}
                        value={v.sku}
                        onChange={(e) => updateVariantField(v.id, "sku", e.target.value)}
                        placeholder="optional"
                        className="h-8 text-sm"
                      />
                    </div>
                    {variants.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeVariant(v.id)}
                        className={cn("mb-0.5 text-xs text-destructive hover:bg-destructive/10")}
                      >
                        ✕
                      </Button>
                    )}
                  </div>

                  {/* Fulfillment row */}
                  <div className="mt-2 flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={v.fulfillmentChecked}
                        onChange={(e) =>
                          updateVariantField(v.id, "fulfillmentChecked", e.target.checked)
                        }
                        className="rounded"
                      />
                      Back-order / Pre-order
                    </label>
                    {v.fulfillmentChecked && (
                      <div className="flex items-center gap-1.5">
                        <Label
                          htmlFor={`lead-days-${v.id}`}
                          className="text-xs text-muted-foreground"
                        >
                          Lead days (optional):
                        </Label>
                        <Input
                          id={`lead-days-${v.id}`}
                          type="number"
                          min="1"
                          value={v.leadDays}
                          onChange={(e) => updateVariantField(v.id, "leadDays", e.target.value)}
                          placeholder="e.g. 14"
                          className="w-20 text-xs"
                        />
                        <span className="text-xs text-muted-foreground">days</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create Product"}
        </Button>
        <a
          href="/seller/dashboard/products"
          className="rounded-lg border border-input px-6 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
        >
          Cancel
        </a>
      </div>
    </form>
  )
}
