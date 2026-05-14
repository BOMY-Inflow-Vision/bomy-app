"use client"

import { useState } from "react"

import { createProduct } from "../actions"

type Category = { id: string; name: string }

type VariantRow = {
  id: number
  name: string
  price: string
  stock: string
  sku: string
  attrs: string
}

export function ProductForm({ categories }: { categories: Category[] }) {
  const [variants, setVariants] = useState<VariantRow[]>([
    { id: 0, name: "", price: "", stock: "0", sku: "", attrs: "" },
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
      { id: Date.now(), name: "", price: "", stock: "0", sku: "", attrs: "" },
    ])
  }

  function removeVariant(id: number) {
    setVariants((prev) => prev.filter((v) => v.id !== id))
  }

  function updateVariantField(id: number, field: keyof VariantRow, value: string) {
    setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, [field]: value } : v)))
  }

  return (
    <form action={createProduct} className="space-y-6">
      {/* Hidden: variant count */}
      <input type="hidden" name="variant_count" value={variants.length} />

      {/* Product fields */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Product Details</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Name *</label>
            <input
              name="name"
              required
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              placeholder="e.g. Handmade Tote Bag"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Slug (auto-generated if empty)
            </label>
            <input
              name="slug"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm text-gray-500 focus:border-indigo-500 focus:outline-none"
              placeholder={slugify(nameVal) || "auto-generated"}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Category</label>
            <select
              name="categoryId"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
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
            <label className="mb-1 block text-xs font-medium text-gray-600">Status</label>
            <select
              name="status"
              defaultValue="draft"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">Description</label>
            <textarea
              name="description"
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              placeholder="Describe your product"
            />
          </div>
        </div>
      </div>

      {/* Variants */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Variants *</h2>
          <button
            type="button"
            onClick={addVariant}
            className="rounded-lg border border-indigo-300 px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
          >
            + Add Variant
          </button>
        </div>

        <div className="space-y-3">
          {variants.map((v, idx) => (
            <div key={v.id} className="flex items-end gap-2">
              {/* Hidden indexed fields */}
              <input type="hidden" name={`variant_attrs_${idx}`} value={v.attrs} />

              <div className="flex-1">
                <label className="mb-1 block text-xs text-gray-500">Name *</label>
                <input
                  name={`variant_name_${idx}`}
                  value={v.name}
                  onChange={(e) => updateVariantField(v.id, "name", e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                  placeholder="e.g. Small / Red"
                />
              </div>
              <div className="w-28">
                <label className="mb-1 block text-xs text-gray-500">Price (RM) *</label>
                <input
                  name={`variant_price_${idx}`}
                  value={v.price}
                  onChange={(e) => updateVariantField(v.id, "price", e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                  placeholder="0.00"
                />
              </div>
              <div className="w-20">
                <label className="mb-1 block text-xs text-gray-500">Stock</label>
                <input
                  name={`variant_stock_${idx}`}
                  type="number"
                  min="0"
                  value={v.stock}
                  onChange={(e) => updateVariantField(v.id, "stock", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div className="w-28">
                <label className="mb-1 block text-xs text-gray-500">SKU</label>
                <input
                  name={`variant_sku_${idx}`}
                  value={v.sku}
                  onChange={(e) => updateVariantField(v.id, "sku", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                  placeholder="optional"
                />
              </div>
              {variants.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeVariant(v.id)}
                  className="mb-0.5 rounded px-2 py-1.5 text-xs text-red-500 hover:bg-red-50"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Create Product
        </button>
        <a
          href="/seller/dashboard/products"
          className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </a>
      </div>
    </form>
  )
}
