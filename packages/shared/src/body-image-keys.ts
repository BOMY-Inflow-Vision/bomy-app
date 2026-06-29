import { parse } from "node-html-parser"

const KEY_RE =
  /^body\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|gif|avif)$/i

export function classifyImageUrl(
  url: string,
  productId: string,
  publicOrigin: string,
): "managed" | "external" | "invalid" {
  try {
    const u = new URL(url)
    const r2Origin = new URL(publicOrigin).origin
    if (u.origin === r2Origin) {
      const path = decodeURIComponent(u.pathname).replace(/^\//, "")
      const match = KEY_RE.exec(path)
      return match && match[1]!.toLowerCase() === productId.toLowerCase() ? "managed" : "invalid"
    }
    return u.protocol === "https:" ? "external" : "invalid"
  } catch {
    return "invalid"
  }
}

export function extractManagedBodyImageKeys(
  html: string,
  productId: string,
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
      const match = KEY_RE.exec(path)
      if (match && match[1]!.toLowerCase() === productId.toLowerCase()) {
        keys.add(path)
      }
    } catch {
      // skip unparseable URLs
    }
  }
  return keys
}
