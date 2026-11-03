// Rating helpers for the web app. The window length and the stars validator live in @bomy/db (one
// source, shared with the SQL); re-exported here so web code imports from one place.
export { RATING_WINDOW_HOURS, parseStars } from "@bomy/db"

import { RATING_WINDOW_HOURS } from "@bomy/db"

/** Prints the stored (already rounded, numeric(3,2)) average with one decimal. No second rounding. */
export function formatRatingAvg(avg: string | number): string {
  return Number(avg).toFixed(1)
}

/** Whole hours left to change a rating, rounded up; 0 once the window has closed. */
export function windowHoursLeft(createdAt: Date, now: Date): number {
  const leftMs = createdAt.getTime() + RATING_WINDOW_HOURS * 3_600_000 - now.getTime()
  return leftMs <= 0 ? 0 : Math.ceil(leftMs / 3_600_000)
}
