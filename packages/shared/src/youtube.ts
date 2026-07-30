/** Canonical YouTube video ID shape — exactly 11 characters. This is the
 * single source of truth; do not redefine this pattern elsewhere. */
export const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/

export function isValidYoutubeVideoId(id: string): boolean {
  return YOUTUBE_VIDEO_ID_RE.test(id)
}

/** Extracts a canonical 11-char video ID from a pasted YouTube URL (any of
 * watch?v=, youtu.be/, /embed/, /shorts/, /live/) or a bare ID. Returns
 * null if no valid ID can be found. */
export function extractYoutubeVideoId(input: string): string | null {
  const trimmed = input.trim()
  const urlMatch = trimmed.match(
    /(?:v=|youtu\.be\/|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/,
  )
  if (urlMatch) return urlMatch[1]!
  return YOUTUBE_VIDEO_ID_RE.test(trimmed) ? trimmed : null
}
