"use client"

import { useState, useActionState, useTransition } from "react"

import { updateStoreCategories, updateStoreSettings } from "./actions"

type State = { ok: true } | { ok: false; error: string } | null

const EXCERPT_MAX = 160

function formAction(_prev: State, formData: FormData): Promise<State> {
  return updateStoreSettings(formData)
}

export function SettingsForm({
  currentExcerpt,
  allCategories,
  assignedCategoryIds,
}: {
  currentExcerpt: string
  allCategories: { id: string; name: string }[]
  assignedCategoryIds: string[]
}) {
  const [excerptState, excerptAction, excerptPending] = useActionState(formAction, null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set(assignedCategoryIds))
  const [catState, setCatState] = useState<State>(null)
  const [catPending, startCatTransition] = useTransition()

  function toggleCategory(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function saveCategories() {
    startCatTransition(async () => {
      const result = await updateStoreCategories([...selected])
      setCatState(result)
    })
  }

  return (
    <div className="max-w-xl space-y-6">
      {/* Excerpt */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Store Introduction</h2>
        <form action={excerptAction} className="space-y-4">
          {excerptState && !excerptState.ok && (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {excerptState.error}
            </div>
          )}
          {excerptState?.ok && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700"
            >
              Settings saved.
            </div>
          )}
          <div>
            <label htmlFor="excerpt" className="mb-1 block text-sm font-medium text-gray-700">
              Brief introduction{" "}
              <span className="font-normal text-gray-400">(shown on the Brands listing page)</span>
            </label>
            <textarea
              id="excerpt"
              name="excerpt"
              rows={3}
              maxLength={EXCERPT_MAX}
              defaultValue={currentExcerpt}
              placeholder="A brief introduction to your store…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
            />
            <p className="mt-1 text-xs text-gray-400">Up to {EXCERPT_MAX} characters.</p>
          </div>
          <button
            type="submit"
            disabled={excerptPending}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {excerptPending ? "Saving…" : "Save"}
          </button>
        </form>
      </div>

      {/* Categories */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Store Categories</h2>
        {catState && !catState.ok && (
          <div
            role="alert"
            aria-live="assertive"
            className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {catState.error}
          </div>
        )}
        {catState?.ok && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700"
          >
            Categories saved.
          </div>
        )}
        {allCategories.length === 0 ? (
          <p className="text-sm text-gray-400">No store categories available yet.</p>
        ) : (
          <fieldset>
            <legend className="mb-3 text-xs text-gray-500">Select all that apply</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {allCategories.map((cat) => (
                <label
                  key={cat.id}
                  className="flex cursor-pointer items-center gap-2 text-sm text-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(cat.id)}
                    onChange={() => toggleCategory(cat.id)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  {cat.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <button
          type="button"
          onClick={saveCategories}
          disabled={catPending || allCategories.length === 0}
          className="mt-4 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {catPending ? "Saving…" : "Save Categories"}
        </button>
      </div>
    </div>
  )
}
