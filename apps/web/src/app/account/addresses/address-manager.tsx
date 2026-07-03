"use client"

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { MY_STATES } from "@/lib/shipping-address-schema"

import { addAddress, deleteAddress, setDefault, updateAddress } from "./actions"
import type { AddressBookErrors } from "./address-schema"

type Row = {
  id: string
  label: string | null
  name: string
  phone: string
  line1: string
  line2: string
  city: string
  postcode: string
  state: string
  isDefault: boolean
}

const EMPTY = {
  label: "",
  name: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  postcode: "",
  state: "",
}

export function AddressManager({ initial }: { initial: Row[] }) {
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<AddressBookErrors & { form?: string }>({})
  const [pending, startTransition] = useTransition()

  const formOpen = adding || editingId !== null

  function field(k: keyof typeof EMPTY) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }))
  }

  function resetForm() {
    setAdding(false)
    setEditingId(null)
    setErrors({})
    setForm(EMPTY)
  }

  function startEdit(a: Row) {
    setAdding(false)
    setEditingId(a.id)
    setErrors({})
    setForm({
      label: a.label ?? "",
      name: a.name,
      phone: a.phone,
      line1: a.line1,
      line2: a.line2,
      city: a.city,
      postcode: a.postcode,
      state: a.state,
    })
  }

  return (
    <div className="space-y-6">
      <ul className="space-y-3">
        {initial.map((a) => (
          <li key={a.id}>
            <Card>
              <CardContent className="p-4 text-sm">
                <div className="flex items-start justify-between">
                  <div>
                    {a.label && <div className="font-medium text-foreground">{a.label}</div>}
                    <div className="text-foreground">
                      {a.name} · {a.phone}
                    </div>
                    <div className="text-muted-foreground">
                      {[a.line1, a.line2, a.city, a.postcode, a.state].filter(Boolean).join(", ")}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {a.isDefault ? (
                      <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
                        Default
                      </span>
                    ) : (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        disabled={pending}
                        onClick={() => startTransition(async () => void (await setDefault(a.id)))}
                        className="h-auto p-0 text-xs"
                      >
                        Set default
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      disabled={pending}
                      onClick={() => startEdit(a)}
                      className="h-auto p-0 text-xs"
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      disabled={pending}
                      onClick={() => startTransition(async () => void (await deleteAddress(a.id)))}
                      className="h-auto p-0 text-xs text-destructive hover:text-destructive"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
        {initial.length === 0 && (
          <li className="text-sm text-muted-foreground">No saved addresses yet.</li>
        )}
      </ul>

      {!formOpen ? (
        <Button
          type="button"
          onClick={() => {
            setForm(EMPTY)
            setAdding(true)
          }}
        >
          Add address
        </Button>
      ) : (
        <form
          className="space-y-3 rounded-lg border border-border p-4"
          onSubmit={(e) => {
            e.preventDefault()
            setErrors({})
            startTransition(async () => {
              const input = {
                label: form.label,
                name: form.name,
                phone: form.phone,
                line1: form.line1,
                line2: form.line2,
                city: form.city,
                postcode: form.postcode,
                state: form.state as (typeof MY_STATES)[number],
                country: "MY" as const,
              }
              const res = editingId
                ? await updateAddress(editingId, input)
                : await addAddress(input)
              if (res.ok) {
                resetForm()
              } else {
                setErrors(res.errors)
              }
            })
          }}
        >
          {errors.form && <p className="text-xs text-destructive">{errors.form}</p>}
          <AddressField
            id="addr-label"
            label="Label (e.g. Home)"
            placeholder="Label (e.g. Home)"
            value={form.label}
            onChange={field("label")}
            err={errors.label}
          />
          <AddressField
            id="addr-name"
            label="Full name"
            placeholder="Full name"
            value={form.name}
            onChange={field("name")}
            err={errors.name}
          />
          <AddressField
            id="addr-phone"
            label="Phone"
            placeholder="Phone (+60…)"
            value={form.phone}
            onChange={field("phone")}
            err={errors.phone}
          />
          <AddressField
            id="addr-line1"
            label="Address line 1"
            placeholder="Address line 1"
            value={form.line1}
            onChange={field("line1")}
            err={errors.line1}
          />
          <AddressField
            id="addr-line2"
            label="Address line 2 (optional)"
            placeholder="Address line 2 (optional)"
            value={form.line2}
            onChange={field("line2")}
            err={errors.line2}
          />
          <AddressField
            id="addr-city"
            label="City"
            placeholder="City"
            value={form.city}
            onChange={field("city")}
            err={errors.city}
          />
          <AddressField
            id="addr-postcode"
            label="Postcode"
            placeholder="Postcode"
            value={form.postcode}
            onChange={field("postcode")}
            err={errors.postcode}
          />
          <div>
            <Label htmlFor="addr-state">State</Label>
            <select
              id="addr-state"
              value={form.state}
              onChange={field("state")}
              className={cn(
                "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              )}
            >
              <option value="">Select state…</option>
              {MY_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {errors.state && <p className="mt-1 text-xs text-destructive">{errors.state}</p>}
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : editingId ? "Save changes" : "Save address"}
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={resetForm}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

function AddressField({
  id,
  label,
  err,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  id: string
  label: string
  err?: string | undefined
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} className="mt-1" />
      {err && <p className="mt-1 text-xs text-destructive">{err}</p>}
    </div>
  )
}
