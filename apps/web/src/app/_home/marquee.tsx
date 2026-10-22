import type { HOME_COPY } from "./home-copy"
import type { HomeCategory } from "./home-types"

// A still band of words and real category names between the hero and the shop. Decoration only:
// screen readers skip it, it never moves (motion is R6), and anything wider than the screen is cut.
export function Marquee({
  categories,
  copy,
}: {
  categories: HomeCategory[]
  copy: (typeof HOME_COPY)["marquee"]
}) {
  const words = [...copy, ...categories.map((c) => c.name)]
  return (
    <div
      data-home="marquee"
      aria-hidden="true"
      className="overflow-hidden rounded-full border border-border bg-card py-3"
    >
      <ul className="flex w-max items-center gap-6 whitespace-nowrap px-6 font-display text-lg text-foreground">
        {words.map((w, i) => (
          <li key={`${i}-${w}`} className="flex items-center gap-6">
            <span>{w}</span>
            <span className="size-1.5 rounded-full bg-primary" />
          </li>
        ))}
      </ul>
    </div>
  )
}
