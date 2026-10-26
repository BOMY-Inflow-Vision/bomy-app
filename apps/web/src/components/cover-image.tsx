"use client"

import * as React from "react"
import { Package } from "lucide-react"

// Product cover for the storefront tiles. A missing URL, or a URL that fails to load, shows the
// Package icon instead of a broken-image glyph. Failure is remembered per URL, so a card that
// receives a new URL tries it again. Two failure paths: the img `error` event, and a mount check
// (`complete` with no pixels) for an image that failed before React hydrated.
export function CoverImage({
  src,
  alt,
  fit = "cover",
}: {
  src: string | null
  alt: string
  /** `contain` keeps a cut-out picture whole (product tiles); `cover` crops to fill (default). */
  fit?: "cover" | "contain"
}) {
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null)
  const ref = React.useRef<HTMLImageElement>(null)

  React.useEffect(() => {
    const el = ref.current
    if (src && el && el.complete && el.naturalWidth === 0) setFailedSrc(src)
  }, [src])

  if (!src || failedSrc === src) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        <Package aria-hidden="true" className="size-10" />
      </div>
    )
  }
  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      width={400}
      height={400}
      className={fit === "contain" ? "size-full object-contain" : "h-full w-full object-cover"}
      onError={() => setFailedSrc(src)}
    />
  )
}
