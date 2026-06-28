import "server-only"

import DOMPurify from "isomorphic-dompurify"
import { parse, type HTMLElement } from "node-html-parser"

import { classifyImageUrl } from "@bomy/shared"

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
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
  ],
  ALLOWED_ATTR: [
    "href",
    "rel",
    "target",
    "src",
    "alt",
    "width",
    "height",
    "loading",
    "decoding",
    "referrerpolicy",
    "data-video-provider",
    "data-video-id",
    "data-video-title",
    "colspan",
    "rowspan",
    "scope",
  ],
}

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{1,11}$/

function hasMeaningfulContent(root: HTMLElement): boolean {
  if (root.querySelectorAll("img, figure").length > 0) return true
  return root.textContent.trim().length > 0
}

export function normalizeBodyHtml(
  raw: string,
  productId: string,
  publicOrigin: string,
): { ok: true; canonicalHtml: string | null } | { ok: false; error: string } {
  const sanitized = DOMPurify.sanitize(raw, SANITIZE_CONFIG)
  const root = parse(sanitized)

  // Strip img elements with data: URIs — DOMPurify keeps them in src but they
  // are not valid content (data: is not a supported image source in this editor).
  for (const img of root.querySelectorAll("img")) {
    const src = img.getAttribute("src") ?? ""
    if (src.startsWith("data:")) {
      img.remove()
    }
  }

  for (const a of root.querySelectorAll("a")) {
    a.setAttribute("rel", "noopener noreferrer nofollow ugc")
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
