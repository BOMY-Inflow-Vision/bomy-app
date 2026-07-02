"use client"

import { useState, useActionState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

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
      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Store Introduction</h2>
          <form action={excerptAction} className="space-y-4">
            {excerptState && !excerptState.ok && (
              <div
                role="alert"
                aria-live="assertive"
                className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
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
              <Label htmlFor="excerpt" className="mb-1 block text-sm font-medium">
                Brief introduction{" "}
                <span className="font-normal text-muted-foreground">
                  (shown on the Brands listing page)
                </span>
              </Label>
              <Textarea
                id="excerpt"
                name="excerpt"
                rows={3}
                maxLength={EXCERPT_MAX}
                defaultValue={currentExcerpt}
                placeholder="A brief introduction to your store…"
              />
              <p className="mt-1 text-xs text-muted-foreground">Up to {EXCERPT_MAX} characters.</p>
            </div>
            <Button type="submit" disabled={excerptPending}>
              {excerptPending ? "Saving…" : "Save"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Categories */}
      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Store Categories</h2>
          {catState && !catState.ok && (
            <div
              role="alert"
              aria-live="assertive"
              className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
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
            <p className="text-sm text-muted-foreground">No store categories available yet.</p>
          ) : (
            <fieldset>
              <legend className="mb-3 text-xs text-muted-foreground">Select all that apply</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {allCategories.map((cat) => (
                  <label
                    key={cat.id}
                    className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(cat.id)}
                      onChange={() => toggleCategory(cat.id)}
                      className="rounded border-input text-primary focus:ring-ring"
                    />
                    {cat.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <Button
            type="button"
            onClick={saveCategories}
            disabled={catPending || allCategories.length === 0}
            className="mt-4"
          >
            {catPending ? "Saving…" : "Save Categories"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
