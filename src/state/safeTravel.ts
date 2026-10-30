import { createMemo, createRoot, mapArray } from 'solid-js'
import { playfield } from './playfield'
import { ball } from './ball'
import { reserved, type ReservedArea } from './reserved'
import type { Entrance } from './shots'
import type { Side } from './layout'
import { BALL_STATES, flipperSolver, shotAnalyses } from './solutions'
import type { LaneOutcome } from '../geometry/lane'
import { convexHull } from '../geometry/hull'
import type { Point } from '../geometry/flipper'

// Space the ball's center passes through on its way from a flipper to a
// target, in SVG coordinates. The ball's edge runs a radius past it.

// Lane outcomes good enough to make the shot.
const MADE: LaneOutcome[] = ['smooth', 'chatter']

// Points around a circle aimed at to map the shots to it.
const CIRCLE_TARGETS = 12

/** Regions off each flipper for every shot, from the ball paths that make it. */
const shotRegions = createRoot(() =>
  createMemo(() =>
    shotAnalyses().flatMap((analysis) =>
      analysis.flippers
        .map((f) =>
          Object.values(f.states).flatMap((s) => (s?.lane && MADE.includes(s.lane.outcome) ? s.flight : [])),
        )
        .filter((points) => points.length > 0)
        .map(convexHull),
    ),
  ),
)

/**
 * Points around an area to aim the ball's center at, measured up from the
 * bottom lip. They sit `inset` inside the outline, so a ball there just
 * touches the edge and the region drawn a ball wide stops at the outline.
 */
function targets(area: ReservedArea, inset: number): Entrance[] {
  if (area.kind === 'circle') {
    const r = Math.max(0, area.radius - inset)
    return Array.from({ length: CIRCLE_TARGETS }, (_, i) => {
      const a = (2 * Math.PI * i) / CIRCLE_TARGETS
      return { x: area.center.x + r * Math.cos(a), y: area.center.y + r * Math.sin(a) }
    })
  }
  const pts = area.points
  const n = pts.length
  // Counter-clockwise outlines have the inside on the left of each side.
  const turn = Math.sign(pts.reduce((sum, p, i) => sum + p.x * pts[(i + 1) % n].y - pts[(i + 1) % n].x * p.y, 0)) || 1
  const inward = pts.map((p, i) => {
    const q = pts[(i + 1) % n]
    const length = Math.hypot(q.x - p.x, q.y - p.y) || 1
    return { x: (turn * (p.y - q.y)) / length, y: (turn * (q.x - p.x)) / length }
  })
  // Corners, moved in so they're `inset` from both sides, and the middle of each side.
  return pts.flatMap((p, i) => {
    const q = pts[(i + 1) % n]
    const a = inward[(i + n - 1) % n]
    const b = inward[i]
    // Past a hairpin the two sides' inset lines barely cross; just step off the one side.
    const k = 1 + a.x * b.x + a.y * b.y
    const corner = k > 0.1 ? { x: (a.x + b.x) / k, y: (a.y + b.y) / k } : b
    return [
      { x: p.x + corner.x * inset, y: p.y + corner.y * inset },
      { x: (p.x + q.x) / 2 + b.x * inset, y: (p.y + q.y) / 2 + b.y * inset },
    ]
  })
}

/** Regions off both flippers to each shootable reserved area: every flight that reaches its edge. */
const areaRegions = createRoot(() => {
  const list = mapArray(
    () => reserved,
    (area) =>
      createMemo(() => {
        if (!area.shootable) return []
        const aims = targets(area, ball.diameter / 2)
        const svg: Point[] = aims.map((p) => ({ x: p.x, y: playfield.height - p.y }))
        return (['left', 'right'] as Side[]).flatMap((side) => {
          const { solve } = flipperSolver(side)
          const flights = aims.flatMap((aim) => BALL_STATES.flatMap(({ state }) => solve(aim, state)?.flight ?? []))
          return flights.length > 0 ? [convexHull([...flights, ...svg])] : []
        })
      }),
  )
  return createMemo(() => list().flatMap((regions) => regions()))
})

/** Every region the ball needs kept clear: shots and shootable reserved areas together. */
export const safeTravelRegions = () => [...shotRegions(), ...areaRegions()]
