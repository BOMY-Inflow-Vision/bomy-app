/** Canonical YouTube video ID shape — exactly 11 characters. This is the
 * single source of truth; do not redefine this pattern elsewhere. */
export const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/

export function isValidYoutubeVideoId(id: string): boolean {
  return YOUTUBE_VIDEO_ID_RE.test(id)
}

/** Hostnames that are actually YouTube — anything else is rejected outright,
 * even if it contains a YouTube-shaped path or query string (e.g. an
 * attacker-controlled `?v=` param on a non-YouTube host, or a subdomain
 * suffix like `youtube.com.evil.com`). */
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
])

/** Extracts a canonical 11-char video ID from a pasted YouTube URL (any of
 * watch?v=, youtu.be/, /embed/, /shorts/, /live/) or a bare ID. Returns
 * null if no valid ID can be found. Validates the URL's host against an
 * allowlist — a YouTube-shaped path or query param on a non-YouTube host
 * (e.g. `https://example.com/watch?v=<id>`) is rejected, not extracted. */
export function extractYoutubeVideoId(input: string): string | null {
  const trimmed = input.trim()

  // Bare 11-char ID, no URL wrapper — intentionally checked before attempting
  // to parse as a URL, since a bare ID is not a URL at all.
  if (YOUTUBE_VIDEO_ID_RE.test(trimmed)) return trimmed

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  const host = url.hostname.toLowerCase()
  if (!YOUTUBE_HOSTS.has(host)) return null

  if (host === "youtu.be") {
    const id = url.pathname.replace(/^\//, "").split("/")[0] ?? ""
    return YOUTUBE_VIDEO_ID_RE.test(id) ? id : null
  }

  const vParam = url.searchParams.get("v")
  if (vParam && YOUTUBE_VIDEO_ID_RE.test(vParam)) return vParam

  const pathMatch = url.pathname.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/)
  if (pathMatch) return pathMatch[1]!

  return null
}
