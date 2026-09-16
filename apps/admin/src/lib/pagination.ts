export const PAGE_SIZE = 25

export function parsePage(raw: string | undefined): number {
  const n = raw ? Number.parseInt(raw, 10) : 1
  return Number.isFinite(n) && n > 0 ? n : 1
}

export function pageOffset(page: number, pageSize: number = PAGE_SIZE): number {
  return (page - 1) * pageSize
}

export function pageCount(total: number, pageSize: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize))
}
