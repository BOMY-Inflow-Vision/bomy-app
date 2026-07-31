import { describe, expect, it } from "vitest"

import { extractYoutubeVideoId, isValidYoutubeVideoId } from "../src/youtube.js"

describe("YOUTUBE_VIDEO_ID_RE / isValidYoutubeVideoId", () => {
  it("accepts exactly 11 chars of the allowed alphabet", () => {
    expect(isValidYoutubeVideoId("dQw4w9WgXcQ")).toBe(true)
  })

  it("rejects fewer than 11 chars", () => {
    expect(isValidYoutubeVideoId("short")).toBe(false)
  })

  it("rejects more than 11 chars", () => {
    expect(isValidYoutubeVideoId("dQw4w9WgXcQextra")).toBe(false)
  })

  it("rejects characters outside [A-Za-z0-9_-]", () => {
    expect(isValidYoutubeVideoId("dQw4w9WgX@Q")).toBe(false)
  })

  it("accepts underscores and hyphens", () => {
    expect(isValidYoutubeVideoId("a_B-1_2-3c4")).toBe(true)
  })
})

describe("extractYoutubeVideoId", () => {
  it("extracts from a watch?v= URL", () => {
    expect(extractYoutubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("extracts from a youtu.be short URL", () => {
    expect(extractYoutubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("extracts from an /embed/ URL", () => {
    expect(extractYoutubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("extracts from a /shorts/ URL", () => {
    expect(extractYoutubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("extracts from a /live/ URL", () => {
    expect(extractYoutubeVideoId("https://www.youtube.com/live/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("accepts a bare 11-char ID with no URL wrapper", () => {
    expect(extractYoutubeVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("trims surrounding whitespace before matching a bare ID", () => {
    expect(extractYoutubeVideoId("  dQw4w9WgXcQ  ")).toBe("dQw4w9WgXcQ")
  })

  it("returns null for a non-YouTube URL", () => {
    expect(extractYoutubeVideoId("https://vimeo.com/12345678")).toBeNull()
  })

  it("returns null for a too-short bare string", () => {
    expect(extractYoutubeVideoId("abc")).toBeNull()
  })

  it("returns null for empty input", () => {
    expect(extractYoutubeVideoId("")).toBeNull()
  })
})
