export function senToMyr(sen: bigint): string {
  const abs = sen < 0n ? -sen : sen
  const myr = Number(abs) / 100
  return myr.toFixed(2)
}
