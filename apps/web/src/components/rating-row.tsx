import { formatRatingAvg } from "@/lib/ratings"
import { cn } from "@/lib/utils"

/** `★ 4.6 (23)`; `★ 0 (0)` muted when nobody has rated yet. */
export function RatingRow({
  avg,
  count,
  className,
}: {
  avg: string | number
  count: number
  className?: string
}) {
  const none = count === 0
  const label = none
    ? "Not rated yet"
    : `Rated ${formatRatingAvg(avg)} out of 5 from ${count} ${count === 1 ? "rating" : "ratings"}`
  return (
    <span
      className={cn(
        "inline-flex items-baseline text-xs tabular-nums",
        none ? "text-muted-foreground" : "text-foreground",
        className,
      )}
    >
      <span aria-hidden="true">★</span>{" "}
      <span role="img" aria-label={label}>
        {none ? "0" : formatRatingAvg(avg)} ({count})
      </span>
    </span>
  )
}
