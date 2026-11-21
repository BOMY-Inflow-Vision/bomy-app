import { PageFrame } from "@/components/admin-ui/page-frame"
import { PageHeader } from "@/components/admin-ui/page-header"
import { requireAdmin } from "@/lib/auth"
import { NewStoreForm } from "./new-store-form"

export default async function NewStorePage() {
  await requireAdmin()

  return (
    <PageFrame width="narrow">
      <PageHeader title="Create Store" />
      <NewStoreForm />
    </PageFrame>
  )
}
