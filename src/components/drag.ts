import { playfield } from '../state/playfield'
import type { Point } from '../geometry/flipper'

/**
 * Track a pointer drag on an SVG element, reporting positions in playfield
 * coordinates (inches, measured up from the bottom lip), and calling `onEnd`
 * when it's let go.
 */
export function startDrag(event: PointerEvent, onMove: (p: Point) => void, onEnd?: () => void) {
  const handle = event.currentTarget as SVGGraphicsElement
  const svg = handle.ownerSVGElement
  if (!svg || event.button !== 0) return false
  event.preventDefault()
  handle.setPointerCapture(event.pointerId)

  const move = (e: PointerEvent) => {
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    // SVG y grows downward; shot positions are measured up from the bottom lip.
    onMove({ x: p.x, y: playfield.height - p.y })
  }
  const end = () => {
    handle.removeEventListener('pointermove', move)
    handle.removeEventListener('pointerup', end)
    handle.removeEventListener('pointercancel', end)
    onEnd?.()
  }
  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', end)
  handle.addEventListener('pointercancel', end)
  return true
}

// A press that moves less than this before it's let go is a click, pixels.
const CLICK_SLOP = 4

// Presses something on the playfield has already taken as a click.
const claimed = new WeakSet<PointerEvent>()

/** Whether a press was already taken as a click by something under the pointer. */
export const isClaimed = (event: PointerEvent) => claimed.has(event)

/**
 * Call `onClick` if a press is let go about where it started. A press that
 * turns into a drag is left to pan the view as usual.
 */
export function clickUnlessDragged(event: PointerEvent, onClick: () => void) {
  if (event.button !== 0) return
  claimed.add(event)
  const from = { x: event.clientX, y: event.clientY }
  const release = (up: PointerEvent) => {
    window.removeEventListener('pointerup', release)
    if (Math.hypot(up.clientX - from.x, up.clientY - from.y) < CLICK_SLOP) onClick()
  }
  window.addEventListener('pointerup', release)
}
