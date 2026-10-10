export const ALL = "all"

export type StoreOption = { id: string; name: string; href: string }

export function hrefForStore(value: string, allHref: string, options: StoreOption[]): string {
  if (value === ALL) return allHref
  return options.find((option) => option.id === value)?.href ?? allHref
}

// Only ids that appear in the store list count as a filter, so the trigger is never blank and a
// malformed value never reaches the query.
export function normalizeStoreId(storeId: string | undefined, stores: { id: string }[]): string {
  return storeId && stores.some((store) => store.id === storeId) ? storeId : ""
}
