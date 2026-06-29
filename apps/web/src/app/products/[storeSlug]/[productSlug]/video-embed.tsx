"use client"

import React, { useState } from "react"

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{1,11}$/

export function VideoEmbed({ videoId, title }: { videoId: string; title?: string | null }) {
  const [active, setActive] = useState(false)

  if (!VIDEO_ID_RE.test(videoId)) return null

  const displayTitle = title ?? "YouTube video"

  if (!active) {
    return (
      <button
        type="button"
        className="relative flex aspect-video w-full cursor-pointer items-center justify-center rounded bg-gray-900 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        onClick={() => setActive(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setActive(true)
          }
        }}
        aria-label={`Play: ${displayTitle}`}
        data-video-id={videoId}
      >
        <div className="text-center">
          <svg
            className="mx-auto h-16 w-16 opacity-80"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <path d="M8 5v14l11-7z" />
          </svg>
          <p className="mt-2 text-sm font-medium">{displayTitle}</p>
        </div>
      </button>
    )
  }

  return (
    <div className="aspect-video w-full">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}`}
        title={displayTitle}
        allowFullScreen
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        className="h-full w-full rounded"
      />
    </div>
  )
}
