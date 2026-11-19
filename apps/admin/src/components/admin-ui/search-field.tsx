"use client"

import * as React from "react"
import { Search } from "lucide-react"

import { Input } from "@bomy/ui/input"
import { Label } from "@bomy/ui/label"
import { cn } from "@/lib/utils"

// The admin's one search box: a pill with a magnifier on the left, and Cmd + K (Mac) or Ctrl + K
// jumps to it from anywhere on the page, with a small key hint while it is empty. It is a plain
// GET form field (`name`), so it works without scripting; the parent form carries the other
// filters as hidden fields. Not while a dialog is open.
export function SearchField({
  id,
  name = "q",
  label,
  placeholder,
  defaultValue = "",
  className,
}: {
  id: string
  name?: string
  label: string
  placeholder: string
  defaultValue?: string
  className?: string
}) {
  const box = React.useRef<HTMLInputElement>(null)
  const [mac, setMac] = React.useState(true)
  const [empty, setEmpty] = React.useState(defaultValue === "")

  React.useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent))
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "k") return
      if (document.querySelector('[aria-modal="true"]')) return
      e.preventDefault()
      box.current?.focus()
      box.current?.select()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div className={cn("relative min-w-0", className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <Input
        ref={box}
        id={id}
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
        onChange={(e) => setEmpty(e.target.value === "")}
        className="h-10 w-full rounded-full border-0 bg-card pl-10 pr-16 text-sm shadow-tile focus-visible:ring-2 focus-visible:ring-ring"
      />
      {empty && (
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-foreground/[.07] px-1.5 py-0.5 font-sans text-xs font-semibold text-muted-foreground [@media(pointer:coarse)]:hidden"
        >
          {mac ? "⌘K" : "Ctrl K"}
        </kbd>
      )}
    </div>
  )
}
