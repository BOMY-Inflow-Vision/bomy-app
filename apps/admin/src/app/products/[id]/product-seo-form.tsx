"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { updateProductSeo } from "../actions"

type State = { ok: true } | { ok: false; error: string } | null

export function ProductSeoForm({
  productId,
  currentMetaTitle,
  currentMetaDescription,
  currentOgImageUrl,
}: {
  productId: string
  currentMetaTitle: string
  currentMetaDescription: string
  currentOgImageUrl: string
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: State, formData: FormData) => updateProductSeo(productId, formData),
    null,
  )

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground">SEO</h2>
        <form action={formAction} className="max-w-xl space-y-4">
          {state && !state.ok && (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {state.error}
            </div>
          )}
          {state?.ok && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700"
            >
              Saved.
            </div>
          )}
          <div>
            <Label htmlFor="metaTitle" className="mb-1 block text-sm font-medium">
              Meta title
            </Label>
            <Input id="metaTitle" name="metaTitle" maxLength={70} defaultValue={currentMetaTitle} />
          </div>
          <div>
            <Label htmlFor="metaDescription" className="mb-1 block text-sm font-medium">
              Meta description
            </Label>
            <Textarea
              id="metaDescription"
              name="metaDescription"
              rows={3}
              maxLength={160}
              defaultValue={currentMetaDescription}
            />
          </div>
          <div>
            <Label htmlFor="ogImageUrl" className="mb-1 block text-sm font-medium">
              OG image URL
            </Label>
            <Input
              id="ogImageUrl"
              name="ogImageUrl"
              type="url"
              defaultValue={currentOgImageUrl}
              placeholder="https://…"
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
