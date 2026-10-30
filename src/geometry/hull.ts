import type { Point } from './flipper'

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

/** Smallest convex polygon holding every point, corners in order around it. */
export function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (sorted.length < 3) return sorted
  // Andrew's monotone chain: the lower then the upper side, left to right and back.
  const side = (list: Point[]) => {
    const chain: Point[] = []
    for (const p of list) {
      while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], p) <= 0) chain.pop()
      chain.push(p)
    }
    // Each side's last point starts the other.
    chain.pop()
    return chain
  }
  return [...side(sorted), ...side([...sorted].reverse())]
}
