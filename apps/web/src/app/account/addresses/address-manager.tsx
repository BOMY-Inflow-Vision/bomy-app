"use client"

import { useState, useTransition } from "react"

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

type FormValues = {
  label: string
  name: string
  phone: string
  line1: string
  line2: string
  city: string
  postcode: string
  state: string
}

type FormErrors = AddressBookErrors & { form?: string }
type Mode = { type: "none" } | { type: "add" } | { type: "edit"; id: string }

const EMPTY: FormValues = {
  label: "",
  name: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  postcode: "",
  state: "",
}

function rowToForm(a: Row): FormValues {
  return {
    label: a.label ?? "",
    name: a.name,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    postcode: a.postcode,
    state: a.state,
  }
}

function toInput(v: FormValues) {
  return {
    label: v.label,
    name: v.name,
    phone: v.phone,
    line1: v.line1,
    line2: v.line2,
    city: v.city,
    postcode: v.postcode,
    state: v.state as (typeof MY_STATES)[number],
    country: "MY" as const,
  }
}

export function AddressManager({ initial }: { initial: Row[] }) {
  const [mode, setMode] = useState<Mode>({ type: "none" })
  const [errors, setErrors] = useState<FormErrors>({})
  const [pending, startTransition] = useTransition()

  function open(next: Mode) {
    setErrors({})
    setMode(next)
  }

  function submit(
    values: FormValues,
    action: () => Promise<{ ok: true } | { ok: false; errors: FormErrors }>,
  ) {
    setErrors({})
    startTransition(async () => {
      const res = await action()
      if (res.ok) setMode({ type: "none" })
      else setErrors(res.errors)
    })
  }

  return (
    <div className="space-y-6">
      <ul className="space-y-3">
        {initial.map((a) =>
          mode.type === "edit" && mode.id === a.id ? (
            <li key={a.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <AddressForm
                initial={rowToForm(a)}
                errors={errors}
                pending={pending}
                submitLabel="Save changes"
                onCancel={() => open({ type: "none" })}
                onSubmit={(v) => submit(v, () => updateAddress(a.id, toInput(v)))}
              />
            </li>
          ) : (
            <li key={a.id} className="rounded-lg border border-gray-200 bg-white p-4 text-sm">
              <div className="flex items-start justify-between">
                <div>
                  {a.label && <div className="font-medium text-gray-900">{a.label}</div>}
                  <div className="text-gray-700">
                    {a.name} · {a.phone}
                  </div>
                  <div className="text-gray-500">
                    {[a.line1, a.line2, a.city, a.postcode, a.state].filter(Boolean).join(", ")}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {a.isDefault ? (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
                      Default
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => startTransition(async () => void (await setDefault(a.id)))}
                      className="text-xs text-indigo-600 hover:underline disabled:opacity-50"
                    >
                      Set default
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => open({ type: "edit", id: a.id })}
                    className="text-xs text-gray-600 hover:underline disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => startTransition(async () => void (await deleteAddress(a.id)))}
                    className="text-xs text-red-600 hover:underline disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ),
        )}
        {initial.length === 0 && <li className="text-sm text-gray-500">No saved addresses yet.</li>}
      </ul>

      {mode.type === "add" ? (
        <div className="rounded-lg border border-gray-200 p-4">
          <AddressForm
            initial={EMPTY}
            errors={errors}
            pending={pending}
            submitLabel="Save address"
            onCancel={() => open({ type: "none" })}
            onSubmit={(v) => submit(v, () => addAddress(toInput(v)))}
          />
        </div>
      ) : mode.type === "none" ? (
        <button
          type="button"
          onClick={() => open({ type: "add" })}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
        >
          Add address
        </button>
      ) : null}
    </div>
  )
}

function AddressForm({
  initial,
  errors,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: FormValues
  errors: FormErrors
  pending: boolean
  submitLabel: string
  onSubmit: (v: FormValues) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState(initial)

  function field(k: keyof FormValues) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }))
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(form)
      }}
    >
      {errors.form && <p className="text-xs text-red-600">{errors.form}</p>}
      <Input
        placeholder="Label (e.g. Home)"
        value={form.label}
        onChange={field("label")}
        err={errors.label}
      />
      <Input placeholder="Full name" value={form.name} onChange={field("name")} err={errors.name} />
      <Input
        placeholder="Phone (+60…)"
        value={form.phone}
        onChange={field("phone")}
        err={errors.phone}
      />
      <Input
        placeholder="Address line 1"
        value={form.line1}
        onChange={field("line1")}
        err={errors.line1}
      />
      <Input
        placeholder="Address line 2 (optional)"
        value={form.line2}
        onChange={field("line2")}
        err={errors.line2}
      />
      <Input placeholder="City" value={form.city} onChange={field("city")} err={errors.city} />
      <Input
        placeholder="Postcode"
        value={form.postcode}
        onChange={field("postcode")}
        err={errors.postcode}
      />
      <select
        value={form.state}
        onChange={field("state")}
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
      >
        <option value="">Select state…</option>
        {MY_STATES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {errors.state && <p className="text-xs text-red-600">{errors.state}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className="text-sm text-gray-500 hover:underline"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function Input({
  err,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { err?: string | undefined }) {
  return (
    <div>
      <input {...props} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  )
}
