// The focal point of a picture: which part stays in view when a square tile crops it. Two whole
// percentages, across (x) and down (y), used as the CSS object-position. 50 / 50 is the centre, the
// browser default, so a picture without a chosen point looks exactly as it always did.
export const FOCAL_CENTRE = 50

/** A whole percentage from 0 to 100. Anything that is not a finite number becomes the centre. */
export function clampFocal(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return FOCAL_CENTRE
  return Math.min(100, Math.max(0, Math.round(n)))
}

/** True when `n` is a finite number the seller action may store (it will be rounded and clamped). */
export function isFocalInput(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n)
}

/** The inline style for a cropped picture, or undefined at the centre so the markup stays unchanged. */
export function focalStyle(x: number | null | undefined, y: number | null | undefined) {
  const fx = clampFocal(x ?? FOCAL_CENTRE)
  const fy = clampFocal(y ?? FOCAL_CENTRE)
  if (fx === FOCAL_CENTRE && fy === FOCAL_CENTRE) return undefined
  return { objectPosition: `${fx}% ${fy}%` }
}

/**
 * How far, in px, a picture of natural size nw x nh overflows a square frame of `frame` px on each
 * axis once it is scaled to cover the frame (object-fit: cover). Zero on an axis means nothing is
 * cropped there, so the focal point has no effect on it.
 */
export function coverOverflow(frame: number, nw: number, nh: number): { x: number; y: number } {
  if (!(frame > 0) || !(nw > 0) || !(nh > 0)) return { x: 0, y: 0 }
  const scale = Math.max(frame / nw, frame / nh)
  return { x: Math.max(0, nw * scale - frame), y: Math.max(0, nh * scale - frame) }
}

/**
 * The focal point after the picture is dragged by `deltaPx` along one axis. object-position p%
 * shifts the picture by -p% of its overflow, so dragging the picture right (positive delta) moves
 * the point left. With no overflow the point stays where it was.
 */
export function dragFocal(startPct: number, deltaPx: number, overflowPx: number): number {
  if (!(overflowPx > 0)) return clampFocal(startPct)
  return clampFocal(startPct - (deltaPx / overflowPx) * 100)
}
