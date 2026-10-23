import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { PageHeading } from "@/components/page-heading"
import { Button } from "@bomy/ui/button"

// Shown for any unknown URL and wherever a page calls notFound(), including the page of a
// store that is suspended or not yet approved (the public store query only finds active stores).
export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-lg flex-col items-center gap-6 px-4 py-24">
      <PageHeading
        align="center"
        title="Page not found"
        description="We could not find that page. It may have moved, or the store may be closed for now."
      />
      <Button asChild variant="outline" icon={<ArrowLeft />} arrowOnHover={false}>
        <Link href="/">Back to home</Link>
      </Button>
    </main>
  )
}
