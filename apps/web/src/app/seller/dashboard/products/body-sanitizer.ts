import "server-only"

import sanitizeHtml from "sanitize-html"
import { parse } from "node-html-parser"

import { classifyImageUrl } from "@bomy/shared"

// sanitize-html is the security boundary — it uses a spec-compliant HTML parser
// (parse5) so its tree matches what browsers build. node-html-parser is used
// only for structural post-processing (image/video validation) after sanitization.
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
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
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "img",
    "figure",
  ],
  allowedAttributes: {
    a: ["href", "rel", "target"],
    img: ["src", "alt", "width", "height", "loading", "decoding", "referrerpolicy"],
    figure: ["data-video-provider", "data-video-id", "data-video-title"],
    table: ["data-bordered"],
    th: ["colspan", "rowspan", "scope"],
    td: ["colspan", "rowspan"],
  },
  allowedSchemes: ["https", "http"],
  allowedSchemesByTag: {
    img: ["https"],
  },
  // Enforce rel on every link — prevents reverse tabnabbing
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        rel: "noopener noreferrer nofollow ugc",
      },
    }),
  },
}

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{1,11}$/

function hasMeaningfulContent(html: string): boolean {
  if (/<(img|figure)[\s>]/i.test(html)) return true
  return html.replace(/<[^>]*>/g, "").trim().length > 0
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

  const sanitized = sanitizeHtml(raw, SANITIZE_OPTIONS)

  if (Buffer.byteLength(sanitized, "utf8") > 200 * 1024) {
    return { ok: false, error: "too_large" }
  }

  const canonicalHtml = hasMeaningfulContent(sanitized) ? sanitized : null

  // Use node-html-parser for structural validation only (image/video rules).
  // Security sanitization is already done above by sanitize-html.
  const root = parse(sanitized)

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
