import type { Point } from './flipper'

// Overlap tests between closed outlines, given as lists of corners.

/** Whether `p` is inside the polygon, by counting edge crossings to its right. */
export function insidePolygon(p: Point, polygon: Point[]) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y)) inside = !inside
  }
  return inside
}

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

function segmentsCross(a: Point, b: Point, c: Point, d: Point) {
  const d1 = cross(c, d, a)
  const d2 = cross(c, d, b)
  const d3 = cross(a, b, c)
  const d4 = cross(a, b, d)
  return d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0
}

function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const span = dx * dx + dy * dy
  const t = span > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / span)) : 0
  return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y)
}

const edges = (polygon: Point[]) => polygon.map((p, i) => [p, polygon[(i + 1) % polygon.length]] as const)

/** Whether two polygons share any area: their edges cross, or one holds the other. */
export function polygonsOverlap(a: Point[], b: Point[]) {
  if (a.length < 3 || b.length < 3) return false
  const bEdges = edges(b)
  if (edges(a).some(([p, q]) => bEdges.some(([r, s]) => segmentsCross(p, q, r, s)))) return true
  return insidePolygon(a[0], b) || insidePolygon(b[0], a)
}

/** Whether a circle and a polygon share any area. */
export function circleOverlapsPolygon(center: Point, radius: number, polygon: Point[]) {
  if (polygon.length < 3) return false
  return insidePolygon(center, polygon) || edges(polygon).some(([a, b]) => segmentDistance(center, a, b) < radius)
}
