import { playfield } from './playfield'
import { addVia, shots } from './shots'
import { shotAnalyses } from './solutions'

// New points snap to this increment, like dragged ones.
const SNAP = 1 / 16

/**
 * Add a via point to a shot halfway along the longest stretch of its lane,
 * on the lane as it is now, so the lane barely changes until it's dragged.
 */
export function insertVia(shotId: number) {
  const shot = shots.find((s) => s.id === shotId)
  const center = shotAnalyses().find((a) => a.id === shotId)?.lane?.center
  if (!shot || !center?.length) return

  // Distance along the center line to the sample nearest each via point.
  const along = shot.via.map((v) => {
    const p = { x: v.x, y: playfield.height - v.y }
    let best = center[0]
    for (const q of center) {
      if (Math.hypot(q.p.x - p.x, q.p.y - p.y) < Math.hypot(best.p.x - p.x, best.p.y - p.y)) best = q
    }
    return best.s
  })
  const stops = [0, ...along, center[center.length - 1].s]
  let gap = 0
  for (let i = 1; i < stops.length - 1; i++) if (stops[i + 1] - stops[i] > stops[gap + 1] - stops[gap]) gap = i

  const target = (stops[gap] + stops[gap + 1]) / 2
  const mid = center.reduce((best, q) => (Math.abs(q.s - target) < Math.abs(best.s - target) ? q : best))
  const snap = (value: number) => Math.round(value / SNAP) * SNAP
  addVia(shotId, gap, { x: snap(mid.p.x), y: snap(playfield.height - mid.p.y) })
}
