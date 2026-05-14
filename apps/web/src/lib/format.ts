export function formatMyrSen(sen: number): string {
  const ringgit = Math.floor(sen / 100)
  const cents = sen % 100
  return `RM${ringgit}.${String(cents).padStart(2, "0")}`
}
