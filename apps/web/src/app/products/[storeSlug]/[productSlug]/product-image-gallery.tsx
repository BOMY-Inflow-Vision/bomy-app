"use client"

import { useState } from "react"

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
      <div className="flex aspect-square items-center justify-center rounded-xl bg-gray-100 text-6xl text-gray-300">
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
        className="relative aspect-square cursor-zoom-in overflow-hidden rounded-xl bg-gray-100"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setZoom(null)}
      >
        {/* Normal view */}
        <img
          src={active.url}
          alt={active.altText ?? productName}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-100 ${zoom ? "opacity-0" : "opacity-100"}`}
        />
        {/* Zoomed pan view */}
        <div
          className={`absolute inset-0 transition-opacity duration-100 ${zoom ? "opacity-100" : "opacity-0"}`}
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
            <button
              type="button"
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow-sm hover:bg-white"
              aria-label="Previous image"
            >
              <svg className="h-4 w-4 text-gray-700" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow-sm hover:bg-white"
              aria-label="Next image"
            >
              <svg className="h-4 w-4 text-gray-700" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => goTo(i)}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100 ring-2 transition-all ${
                i === activeIdx ? "ring-indigo-500" : "ring-transparent hover:ring-gray-300"
              }`}
              aria-label={`View image ${i + 1}`}
            >
              <img src={img.url} alt={img.altText ?? ""} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
