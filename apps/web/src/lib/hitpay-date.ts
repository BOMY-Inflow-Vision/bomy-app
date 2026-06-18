/**
 * HitPay's start_date field is interpreted in SGT (Asia/Singapore, UTC+8).
 * Vercel runs in UTC, so a naive toISOString().slice(0,10) sends yesterday's
 * date during 00:00–07:59 SGT and triggers a 422 from the live API.
 */
export function formatHitPayStartDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]))
  return `${v["year"]}-${v["month"]}-${v["day"]}`
}
