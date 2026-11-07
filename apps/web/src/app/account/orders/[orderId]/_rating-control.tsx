"use client"

import { useId, useState } from "react"
import { Star } from "lucide-react"

import { useToast } from "@/components/toaster"
import { cn } from "@/lib/utils"

import { rateProduct } from "./rating-actions"

// Client component: must not import `@/lib/ratings` or `@bomy/db` (server barrel). The server page
// computes `hoursLeft` and passes the window length (`windowHours`) as plain props.

interface Props {
  orderItemId: string
  productName: string
  /** The buyer's current rating, or null when they have not rated yet. */
  stars: number | null
  /** Whole hours left to change an existing rating; 0 once the window has closed (or no rating). */
  hoursLeft: number
  /** An admin removed the rating: read-only for good. */
  removed: boolean
  canRate: boolean
  /** Length of the change window in hours (RATING_WINDOW_HOURS, passed by the server page). */
  windowHours: number
}

const VALUES = [1, 2, 3, 4, 5] as const

// One star: solid when it counts toward the rating, an outline (hollow, with a border) when it does
// not, so an empty star never looks like a filled one. The colour alone is not the signal.
function StarIcon({ filled }: { filled: boolean }) {
  return (
    <Star
      aria-hidden="true"
      strokeWidth={1.75}
      className={cn(
        "size-6",
        filled ? "fill-primary text-primary" : "fill-transparent text-primary",
      )}
    />
  )
}

function Stars({ value }: { value: number }) {
  return (
    <>
      {VALUES.map((n) => (
        <span key={n} className="px-0.5">
          <StarIcon filled={n <= value} />
        </span>
      ))}
    </>
  )
}

export function RatingControl({
  orderItemId,
  productName,
  stars,
  hoursLeft,
  removed,
  canRate,
  windowHours,
}: Props) {
  const toast = useToast()
  const name = useId()
  const [value, setValue] = useState<number | null>(stars)
  const [hours, setHours] = useState(hoursLeft)
  const [locked, setLocked] = useState(stars !== null && hoursLeft === 0)
  const [isRemoved, setIsRemoved] = useState(removed)
  const [pending, setPending] = useState(false)

  if (!canRate) return null

  async function choose(n: number) {
    if (pending) return
    setPending(true)
    try {
      const result = await rateProduct(orderItemId, n)
      if (result.ok) {
        setValue(n)
        if (value === null) setHours(windowHours)
      } else if (result.error === "WINDOW_CLOSED") {
        setLocked(true)
        toast.info("The window to change this rating has closed.")
      } else if (result.error === "RATING_REMOVED") {
        setIsRemoved(true)
      } else {
        toast.error("Could not save your rating. Please try again.")
      }
    } catch {
      toast.error("Could not save your rating. Please try again.")
    } finally {
      setPending(false)
    }
  }

  // Fixed-height rows so no state shifts the layout.
  const starsRow = "flex h-8 items-center"
  const noteRow = "min-h-5 text-xs text-muted-foreground"

  if (isRemoved) {
    return (
      <div>
        <div className={starsRow} aria-hidden="true" />
        <p className={noteRow}>Your rating was removed</p>
      </div>
    )
  }

  if (locked && value !== null) {
    return (
      <div>
        <div className={starsRow} role="img" aria-label={`Your rating: ${value} out of 5`}>
          <Stars value={value} />
        </div>
        <p className={noteRow}>Rating locked</p>
      </div>
    )
  }

  const note =
    value === null
      ? "Tap a star to rate"
      : `You can change this for ${hours} more ${hours === 1 ? "hour" : "hours"}`

  return (
    <div>
      <div
        role="radiogroup"
        aria-label={`Rate ${productName}`}
        aria-busy={pending}
        className={starsRow}
      >
        {VALUES.map((n) => (
          <label key={n} className="relative cursor-pointer px-0.5">
            <input
              type="radio"
              name={name}
              value={n}
              aria-label={n === 1 ? "1 star" : `${n} stars`}
              checked={value === n}
              onChange={() => void choose(n)}
              className="peer sr-only"
            />
            <span className="block rounded-control peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
              <StarIcon filled={value !== null && n <= value} />
            </span>
          </label>
        ))}
      </div>
      <p className={noteRow}>{note}</p>
    </div>
  )
}
