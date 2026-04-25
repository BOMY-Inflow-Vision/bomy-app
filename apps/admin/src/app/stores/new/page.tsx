import { redirect } from "next/navigation"

import { createStore } from "../actions"

export default function NewStorePage() {
  return (
    <div className="p-6">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">Create Store</h1>
      <form
        action={async (formData) => {
          "use server"
          await createStore(formData)
          redirect("/stores")
        }}
        className="max-w-md space-y-4"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Owner Email *</label>
          <input
            name="ownerEmail"
            type="email"
            required
            placeholder="seller@example.com"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-400">User must already exist in the system</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Store Name *</label>
          <input
            name="name"
            required
            placeholder="Kedai Maju"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Slug *</label>
          <input
            name="slug"
            required
            placeholder="kedai-maju"
            pattern="[a-z0-9-]{3,50}"
            title="Lowercase letters, numbers, hyphens only. 3–50 characters."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Description (optional)
          </label>
          <textarea
            name="description"
            rows={3}
            placeholder="Brief description of the store"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Create Store
          </button>
          <a
            href="/stores"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  )
}
