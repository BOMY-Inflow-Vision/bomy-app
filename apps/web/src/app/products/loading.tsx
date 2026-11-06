import { PageMain } from "@/components/page-main"

function Block({ className }: { className: string }) {
  return (
    <div className={`animate-pulse rounded-md bg-muted motion-reduce:animate-none ${className}`} />
  )
}

export default function ProductsLoading() {
  return (
    <PageMain role="status" aria-label="Loading products">
      <Block className="mb-6 h-8 w-32" />
      <Block className="mb-6 h-10 w-full" />

      <div className="flex flex-col gap-6 sm:flex-row">
        <aside className="w-full sm:w-44 sm:shrink-0">
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Block key={i} className="h-7 w-full" />
            ))}
          </div>
        </aside>

        <section className="flex-1">
          <Block className="mb-4 h-4 w-24" />
          <ul className="grid grid-cols-1 gap-x-3 gap-y-7 sm:gap-x-4 sm:gap-y-10 sm:grid-cols-2 md:grid-cols-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <li
                key={i}
                className="overflow-hidden rounded-xl border border-border bg-background shadow-sm"
              >
                <div className="aspect-square animate-pulse bg-muted motion-reduce:animate-none" />
                <div className="flex flex-col gap-2 p-3">
                  <Block className="h-3 w-16" />
                  <Block className="h-4 w-full" />
                  <Block className="h-3 w-20" />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PageMain>
  )
}
