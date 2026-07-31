import { parse } from "node-html-parser"

export type BodyImageScope = { kind: "product"; id: string } | { kind: "store"; id: string }

// Matches body/<uuid>/<uuid>.<ext> (product) or body/stores/<uuid>/<uuid>.<ext> (store).
// Group 1 is the optional "stores/" marker; group 2 is the owning entity's id.
const KEY_RE =
  /^body\/(stores\/)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|gif|avif)$/i

function matchesScope(path: string, scope: BodyImageScope): boolean {
  const match = KEY_RE.exec(path)
  if (!match) return false
  const isStoreShaped = Boolean(match[1])
  const scopeIsStore = scope.kind === "store"
  if (isStoreShaped !== scopeIsStore) return false
  return match[2]!.toLowerCase() === scope.id.toLowerCase()
}

export function classifyImageUrl(
  url: string,
  scope: BodyImageScope,
  publicOrigin: string,
): "managed" | "external" | "invalid" {
  try {
    const u = new URL(url)
    const r2Origin = new URL(publicOrigin).origin
    if (u.origin === r2Origin) {
      const path = decodeURIComponent(u.pathname).replace(/^\//, "")
      return matchesScope(path, scope) ? "managed" : "invalid"
    }
    return u.protocol === "https:" ? "external" : "invalid"
  } catch {
    return "invalid"
  }
}

export function extractManagedBodyImageKeys(
  html: string,
  scope: BodyImageScope,
  publicOrigin: string,
): Set<string> {
  if (!html) return new Set()
  const root = parse(html)
  const keys = new Set<string>()
  const r2Origin = new URL(publicOrigin).origin
  for (const img of root.querySelectorAll("img")) {
    const src = img.getAttribute("src") ?? ""
    try {
      const u = new URL(src)
      if (u.origin !== r2Origin) continue
      const path = decodeURIComponent(u.pathname).replace(/^\//, "")
      if (matchesScope(path, scope)) keys.add(path)
    } catch {
      // skip unparseable URLs
    }
  }
  return keys
}
