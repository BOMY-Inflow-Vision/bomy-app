"use client"

import { useState } from "react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type ProductImage = { id: string; url: string; altText: string | null }

export function ProductImageGallery({
  images,
  productName,
}: {
  images: ProductImage[]
  productName: string
}) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null)

  if (images.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-xl bg-muted text-6xl text-muted-foreground">
        📦
      </div>
    )
  }

  const active = images[activeIdx]!

  function goTo(i: number) {
    setActiveIdx(i)
    setZoom(null)
  }

  function prev() {
    goTo(activeIdx === 0 ? images.length - 1 : activeIdx - 1)
  }

  function next() {
    goTo(activeIdx === images.length - 1 ? 0 : activeIdx + 1)
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setZoom({ x, y })
  }

  return (
    <div className="space-y-3">
      {/* Main image with zoom */}
      <div
        className="relative aspect-square cursor-zoom-in overflow-hidden rounded-xl bg-muted"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setZoom(null)}
      >
        {/* Normal view */}
        <img
          src={active.url}
          alt={active.altText ?? productName}
          width={800}
          height={800}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-100",
            zoom ? "opacity-0" : "opacity-100",
          )}
        />
        {/* Zoomed pan view */}
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-100",
            zoom ? "opacity-100" : "opacity-0",
          )}
          style={{
            backgroundImage: `url(${active.url})`,
            backgroundSize: "250%",
            backgroundPosition: zoom ? `${zoom.x}% ${zoom.y}%` : "center",
            backgroundRepeat: "no-repeat",
          }}
        />

        {/* Slider arrows */}
        {images.length > 1 && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={prev}
              aria-label="Previous image"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 shadow-sm hover:bg-background"
            >
              <svg
                className="h-4 w-4 text-foreground"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={next}
              aria-label="Next image"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 shadow-sm hover:bg-background"
            >
              <svg
                className="h-4 w-4 text-foreground"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </Button>
          </>
        )}
      </div>

      {/* Thumbnail strip */}
      {/* p-1 on all sides, not just pb-1: overflow-x-auto forces the browser to compute
          overflow-y as auto too (any axis left "visible" next to a non-visible axis becomes
          "auto" per spec), so this container clips like overflow-hidden on every side, not
          just horizontally. With zero top/left padding its clip edge sat flush against the
          first button, cutting off the ring-2's 2px spread on exactly those two sides. */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto p-1">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => goTo(i)}
              className={cn(
                "h-16 w-16 shrink-0 rounded-lg ring-2 transition-all",
                i === activeIdx ? "ring-primary" : "ring-transparent hover:ring-border",
              )}
              aria-label={`View image ${i + 1}`}
            >
              {/* overflow-hidden lives on this inner wrapper, not the button — clipping the
                  ring-2 itself (a box-shadow) against the same element it's drawn on cuts it
                  off, since the shadow needs to paint outside the border box */}
              <span className="block h-full w-full overflow-hidden rounded-lg bg-muted">
                <img
                  src={img.url}
                  alt={img.altText ?? ""}
                  width={64}
                  height={64}
                  className="h-full w-full object-cover"
                />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
