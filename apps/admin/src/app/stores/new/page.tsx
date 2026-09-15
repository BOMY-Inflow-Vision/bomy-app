import { requireAdmin } from "@/lib/auth"
import { NewStoreForm } from "./new-store-form"

export default async function NewStorePage() {
  await requireAdmin()

  return (
    <div className="p-6">
      <h1 className="mb-6 text-lg font-semibold text-foreground">Create Store</h1>
      <NewStoreForm />
    </div>
  )
}
