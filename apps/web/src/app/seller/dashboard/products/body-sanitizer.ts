import "server-only"

import { NodeType, parse, type HTMLElement as NHPElement } from "node-html-parser"

import { classifyImageUrl } from "@bomy/shared"

const ALLOWED_TAGS = new Set([
  "p",
  "h3",
  "h4",
  "strong",
  "em",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "a",
  "blockquote",
  "hr",
  "code",
  "pre",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "img",
  "figure",
])

const PER_ELEMENT_ALLOWED_ATTRS: Record<string, ReadonlySet<string>> = {
  a: new Set(["href", "rel", "target"]),
  img: new Set(["src", "alt", "width", "height", "loading", "decoding", "referrerpolicy"]),
  figure: new Set(["data-video-provider", "data-video-id", "data-video-title"]),
  th: new Set(["colspan", "rowspan", "scope"]),
  td: new Set(["colspan", "rowspan"]),
}

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{1,11}$/

// Recursively strip disallowed tags (with their subtree) and disallowed attributes.
// Security note: removing the entire subtree for disallowed tags is intentional —
// it prevents XSS via nested elements and matches DOMPurify's default behaviour.
function sanitizeElement(el: NHPElement): void {
  for (const child of [...el.childNodes]) {
    if (child.nodeType === NodeType.TEXT_NODE) continue // text node — keep as-is

    const elem = child as NHPElement
    const tag = elem.tagName?.toLowerCase() ?? ""

    if (!ALLOWED_TAGS.has(tag)) {
      elem.remove()
      continue
    }

    // Strip any attribute not in this element's allow-list
    const allowed = PER_ELEMENT_ALLOWED_ATTRS[tag] ?? new Set<string>()
    for (const attr of Object.keys(elem.rawAttributes ?? {})) {
      if (!allowed.has(attr)) elem.removeAttribute(attr)
    }

    // href must be https:// or http:// — strip anything else (blocks javascript: etc.)
    if (tag === "a") {
      const href = elem.getAttribute("href") ?? ""
      if (href && !href.startsWith("https://") && !href.startsWith("http://")) {
        elem.removeAttribute("href")
      }
    }

    sanitizeElement(elem)
  }
}

function hasMeaningfulContent(el: NHPElement): boolean {
  if (el.querySelectorAll("img, figure").length > 0) return true
  return el.textContent.trim().length > 0
}

export function normalizeBodyHtml(
  raw: string,
  productId: string,
  publicOrigin: string,
): { ok: true; canonicalHtml: string | null } | { ok: false; error: string } {
  if (typeof raw !== "string") {
    return { ok: false, error: "invalid_input" }
  }
  const RAW_LIMIT = 400 * 1024
  if (Buffer.byteLength(raw, "utf8") > RAW_LIMIT) {
    return { ok: false, error: "too_large" }
  }

  const root = parse(raw)

  sanitizeElement(root)

  // Strip img elements with data: URIs
  for (const img of root.querySelectorAll("img")) {
    const src = img.getAttribute("src") ?? ""
    if (src.startsWith("data:")) {
      img.remove()
    }
  }

  const reserialized = root.toString()

  if (Buffer.byteLength(reserialized, "utf8") > 200 * 1024) {
    return { ok: false, error: "too_large" }
  }

  const canonicalHtml = hasMeaningfulContent(root) ? reserialized : null

  const imgs = root.querySelectorAll("img")
  for (const img of imgs) {
    const src = img.getAttribute("src") ?? ""
    const cls = classifyImageUrl(src, productId, publicOrigin)
    if (cls === "invalid") return { ok: false, error: "invalid_image_url" }
  }
  if (imgs.length > 10) return { ok: false, error: "too_many_images" }

  for (const fig of root.querySelectorAll("figure")) {
    const provider = fig.getAttribute("data-video-provider")
    const videoId = fig.getAttribute("data-video-id")
    if (provider !== "youtube") return { ok: false, error: "invalid_video" }
    if (!videoId || !VIDEO_ID_RE.test(videoId)) return { ok: false, error: "invalid_video" }
  }

  return { ok: true, canonicalHtml }
}
