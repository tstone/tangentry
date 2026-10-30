import { createSignal } from 'solid-js'
import { playfield } from '../state/playfield'
import type { Point } from '../geometry/flipper'

// Margin around the playfield, in inches (the SVG's user units).
export const PADDING = 2

const MIN_ZOOM = 0.25
const MAX_ZOOM = 20
// Each zoom button press scales by this.
const ZOOM_STEP = 1.25

// 1 fits the whole playfield; 2 shows half as much of it, twice as large.
const [zoom, setZoom] = createSignal(1)
// Point in the middle of the view, SVG coordinates; null centers the playfield.
const [center, setCenter] = createSignal<Point | null>(null)

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

export const viewCenter = () => center() ?? { x: playfield.width / 2, y: playfield.height / 2 }

export const viewBox = () => {
  const width = (playfield.width + PADDING * 2) / zoom()
  const height = (playfield.height + PADDING * 2) / zoom()
  const c = viewCenter()
  return `${c.x - width / 2} ${c.y - height / 2} ${width} ${height}`
}

/** Zoom by `factor`, keeping `anchor` (SVG coordinates) where it is on screen. */
export function zoomBy(factor: number, anchor: Point = viewCenter()) {
  const next = clampZoom(zoom() * factor)
  const kept = zoom() / next
  const c = viewCenter()
  setCenter({ x: anchor.x + (c.x - anchor.x) * kept, y: anchor.y + (c.y - anchor.y) * kept })
  setZoom(next)
}

export const zoomIn = () => zoomBy(ZOOM_STEP)
export const zoomOut = () => zoomBy(1 / ZOOM_STEP)

export function resetView() {
  setZoom(1)
  setCenter(null)
}

export { zoom, setCenter }
