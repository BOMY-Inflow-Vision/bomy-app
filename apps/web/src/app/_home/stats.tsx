import type { HOME_COPY } from "./home-copy"
import type { HomeData } from "./home-types"

const KEYS = ["brands", "products", "categories"] as const

// Three real counts. A tile with a zero count is left out, and with all three at zero the whole row
// goes: no "0" tiles.
export function Stats({
  counts,
  copy,
}: {
  counts: HomeData["counts"]
  copy: (typeof HOME_COPY)["stats"]
}) {
  const shown = KEYS.filter((k) => counts[k] > 0)
  if (shown.length === 0) return null
  return (
    <section data-home="stats" className="min-w-0">
      <h2 className="mb-6 min-w-0 font-display text-display-sm text-foreground [overflow-wrap:anywhere]">
        {copy.title}
      </h2>
      <ul className="grid min-w-0 gap-4 sm:grid-cols-3">
        {shown.map((k) => (
          <li
            key={k}
            data-home={`stat-${k}`}
            className="min-w-0 rounded-bento border border-border bg-card p-6"
          >
            <p className="font-display text-display-sm text-foreground [overflow-wrap:anywhere]">
              {counts[k]}
            </p>
            <p className="mt-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">
              {copy.labels[k]}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
