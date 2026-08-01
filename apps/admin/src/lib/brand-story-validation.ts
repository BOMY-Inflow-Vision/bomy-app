import { parse } from "node-html-parser"

// Minimum plain-text length (after entity decoding, tag stripping, and Unicode
// format-character removal) required for a Brand Story to count as "real text" —
// an admin-provisioning-only quality gate. Deliberately not part of the shared
// sanitizer: product bodies and a seller's own later Settings-page edits should
// not inherit this stricter, admin-only business rule.
export const BRAND_STORY_MIN_CHARS = 20

// Matches every Unicode "format" codepoint (category Cf — zero-width spaces/joiners,
// bidi embedding/override controls, BOM, etc.) via a Unicode property escape rather
// than hand-enumerating codepoint ranges — correct for the whole category, not just
// the handful of characters someone happens to remember, and can't regress into a
// literal invisible character accidentally pasted into source.
const FORMAT_CHAR_RE = /\p{Cf}/gu

/**
 * Extracts readable plain text from sanitized HTML for the mandatory-content check.
 * Uses node-html-parser's textContent (which decodes entities, e.g. &nbsp; -> U+00A0)
 * rather than a regex tag-strip, then removes invisible Unicode format characters and
 * collapses whitespace (including U+00A0, which JS's \s matches).
 */
export function extractPlainText(html: string): string {
  // Ensure spaces between adjacent elements by normalizing ></  to  > <
  // so block elements don't concatenate their text content
  const normalized = html.replace(/>\s*</g, "> <")
  const decoded = parse(normalized).textContent
  return decoded.replace(FORMAT_CHAR_RE, "").replace(/\s+/g, " ").trim()
}
