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
