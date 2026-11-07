"use client"

import * as React from "react"

import { Button } from "@bomy/ui/button"
import { Label } from "@bomy/ui/label"
import { clampFocal, coverOverflow, dragFocal, FOCAL_CENTRE, focalStyle } from "@/lib/focal"

// The focal-point picker for a normal (non-cut-out) photo: a square frame, the same shape as the
// storefront tile, with the picture inside it. The seller drags the picture to choose which part
// stays in view, like moving a profile picture in WhatsApp or Facebook. Two sliders do the same job
// for the keyboard and for anyone who cannot drag. The picture is never cut: only the stored point
// changes, so the original file stays as uploaded.
export function FocusEditor({
  src,
  alt,
  initialX,
  initialY,
  saving = false,
  onSave,
  onCancel,
}: {
  src: string
  alt: string
  initialX: number
  initialY: number
  saving?: boolean
  onSave: (x: number, y: number) => void
  onCancel: () => void
}) {
  const [x, setX] = React.useState(() => clampFocal(initialX))
  const [y, setY] = React.useState(() => clampFocal(initialY))
  const [overflow, setOverflow] = React.useState<{ x: number; y: number } | null>(null)
  const frameRef = React.useRef<HTMLDivElement>(null)
  const imgRef = React.useRef<HTMLImageElement>(null)
  const drag = React.useRef<{
    px: number
    py: number
    x: number
    y: number
    ox: number
    oy: number
  } | null>(null)
  const xId = React.useId()
  const yId = React.useId()

  const measure = React.useCallback(() => {
    const frame = frameRef.current
    const img = imgRef.current
    if (!frame || !img || img.naturalWidth === 0) return null
    return coverOverflow(frame.clientWidth, img.naturalWidth, img.naturalHeight)
  }, [])

  // The picture may already be loaded (cached) before React attaches onLoad.
  React.useEffect(() => {
    const m = measure()
    if (m) setOverflow(m)
  }, [measure, src])

  const changed = x !== clampFocal(initialX) || y !== clampFocal(initialY)
  const flat = overflow !== null && overflow.x < 0.5 && overflow.y < 0.5

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const m = measure()
    if (!m || (m.x < 0.5 && m.y < 0.5)) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { px: e.clientX, py: e.clientY, x, y, ox: m.x, oy: m.y }
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d) return
    setX(dragFocal(d.x, e.clientX - d.px, d.ox))
    setY(dragFocal(d.y, e.clientY - d.py, d.oy))
  }
  function endDrag() {
    drag.current = null
  }

  return (
    <div className="rounded-bento border border-border bg-card p-4" data-focus-editor>
      <h3 className="text-sm font-semibold text-foreground">Choose what stays in view</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {flat
          ? "This picture is square, so nothing is cropped on the cards."
          : "Drag the picture, or use the sliders. The square is how it appears on product cards."}
      </p>

      <div
        ref={frameRef}
        data-focus-frame
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={
          "relative mt-3 aspect-square w-full max-w-xs touch-none select-none overflow-hidden rounded-bento bg-muted ring-1 ring-border " +
          (flat ? "" : "cursor-grab active:cursor-grabbing")
        }
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={false}
          onLoad={() => setOverflow(measure())}
          className="pointer-events-none size-full object-cover"
          style={focalStyle(x, y)}
        />
      </div>

      {!flat && (
        <div className="mt-3 grid max-w-xs gap-3">
          <div>
            <Label htmlFor={xId} className="text-xs">
              Horizontal position
            </Label>
            <input
              id={xId}
              type="range"
              min={0}
              max={100}
              step={1}
              value={x}
              disabled={overflow !== null && overflow.x < 0.5}
              onChange={(e) => setX(clampFocal(Number(e.target.value)))}
              className="mt-1 block w-full accent-primary"
            />
          </div>
          <div>
            <Label htmlFor={yId} className="text-xs">
              Vertical position
            </Label>
            <input
              id={yId}
              type="range"
              min={0}
              max={100}
              step={1}
              value={y}
              disabled={overflow !== null && overflow.y < 0.5}
              onChange={(e) => setY(clampFocal(Number(e.target.value)))}
              className="mt-1 block w-full accent-primary"
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {!flat && (
          <Button
            type="button"
            size="sm"
            disabled={saving || !changed}
            onClick={() => onSave(x, y)}
          >
            {saving ? "Saving…" : "Save focus"}
          </Button>
        )}
        {!flat && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={saving || (x === FOCAL_CENTRE && y === FOCAL_CENTRE)}
            onClick={() => {
              setX(FOCAL_CENTRE)
              setY(FOCAL_CENTRE)
            }}
          >
            Centre
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={onCancel}>
          {flat ? "Close" : "Cancel"}
        </Button>
      </div>
    </div>
  )
}
