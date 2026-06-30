"use client"

import { useActionState } from "react"

import { updateStoreSettings } from "./actions"

type State = { ok: true } | { ok: false; error: string } | null

const EXCERPT_MAX = 160

function formAction(_prev: State, formData: FormData): Promise<State> {
  return updateStoreSettings(formData)
}

export function SettingsForm({ currentExcerpt }: { currentExcerpt: string }) {
  const [state, action, pending] = useActionState(formAction, null)

  return (
    <div className="max-w-xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <form action={action} className="space-y-5">
        {state && !state.ok && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</div>
        )}
        {state?.ok && (
          <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
            Settings saved.
          </div>
        )}

        <div>
          <label htmlFor="excerpt" className="mb-1 block text-sm font-medium text-gray-700">
            Store introduction{" "}
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
          disabled={pending}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  )
}
