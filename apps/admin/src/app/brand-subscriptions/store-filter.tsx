"use client"

import { useRouter } from "next/navigation"

import { Label } from "@bomy/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@bomy/ui/select"

import { ALL, hrefForStore, type StoreOption } from "./store-filter-helpers"

export function StoreFilter({
  value,
  allHref,
  options,
}: {
  value: string
  allHref: string
  options: StoreOption[]
}) {
  const router = useRouter()
  return (
    <div className="flex items-center gap-2 text-sm">
      <Label htmlFor="store-filter" className="text-muted-foreground">
        Store
      </Label>
      <Select
        value={value || ALL}
        onValueChange={(next) => router.push(hrefForStore(next, allHref, options))}
      >
        <SelectTrigger id="store-filter" className="w-56 max-w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All stores</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
