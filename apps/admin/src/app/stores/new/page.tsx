import Link from "next/link"
import { redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createStore } from "../actions"

export default function NewStorePage() {
  return (
    <div className="p-6">
      <h1 className="mb-6 text-lg font-semibold text-foreground">Create Store</h1>
      <form
        action={async (formData) => {
          "use server"
          await createStore(formData)
          redirect("/stores")
        }}
        className="max-w-md space-y-4"
      >
        <div>
          <Label htmlFor="ownerEmail" className="mb-1 block">
            Owner Email *
          </Label>
          <Input
            id="ownerEmail"
            name="ownerEmail"
            type="email"
            required
            placeholder="seller@example.com"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            User must already exist in the system
          </p>
        </div>
        <div>
          <Label htmlFor="name" className="mb-1 block">
            Store Name *
          </Label>
          <Input id="name" name="name" required placeholder="Kedai Maju" />
        </div>
        <div>
          <Label htmlFor="slug" className="mb-1 block">
            Slug *
          </Label>
          <Input
            id="slug"
            name="slug"
            required
            placeholder="kedai-maju"
            pattern="[a-z0-9-]{3,50}"
            title="Lowercase letters, numbers, hyphens only. 3–50 characters."
            className="font-mono"
          />
        </div>
        <div>
          <Label htmlFor="description" className="mb-1 block">
            Description (optional)
          </Label>
          <Textarea
            id="description"
            name="description"
            rows={3}
            placeholder="Brief description of the store"
          />
        </div>
        <div className="flex gap-3">
          <Button type="submit">Create Store</Button>
          <Button variant="outline" asChild>
            <Link href="/stores">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
