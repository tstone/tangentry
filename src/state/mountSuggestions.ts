import { batch } from 'solid-js'
import { ball } from './ball'
import { playfield } from './playfield'
import { walls } from './walls'
import { setMounts, newMount, type WallMount } from './shots'
import { WALL_SIDES, contactWall, piecewiseStiffness, shotAnalyses } from './solutions'
import { MAX_FLEX, flexPerSpeed, type MountKind } from '../physics/wall'
import { ballMass } from '../physics/drive'
import { normal } from '../geometry/lane'

// Speed into the wall (in/s) assumed everywhere, standing in for shots
// that aren't modeled: balls coming back down the lane, nudges, other
// shots crossing it.
const NOMINAL_HIT = 30
// Room a spade bolt needs on the outside of the wall, inches. Where a side
// rail or another lane's wall is closer than this, a spike goes in instead.
const SPADE_CLEARANCE = 0.5
// Spade bolts this far in from each end of the wall, inches.
const END_INSET = 0.4
// Closest two mounts can sit, inches.
const MIN_GAP = 0.75
// Hits spread their load this far either side along the wall, inches.
const HIT_SPREAD = 0.5
const MAX_MOUNTS = 16

type Placed = { kind: MountKind; index: number }

/**
 * Replace a shot's wall mounts with a suggested set: mounts at each end, then
 * mounts added one at a time at whichever point flexes furthest under its
 * hardest hit, until none flexes more than MAX_FLEX. Hits come from the
 * shot's solved ball paths, with a nominal hit assumed everywhere else.
 * Mounts are spade bolts unless there's no room for one beside the wall.
 */
export function suggestMounts(shotId: number) {
  const analysis = shotAnalyses().find((a) => a.id === shotId)
  const lane = analysis?.lane
  if (!analysis || !lane) return
  const mass = ballMass(ball.diameter)
  // Walls of the other lanes, which can crowd out a spade bolt.
  const others = shotAnalyses().flatMap((a) => (a.id !== shotId && a.lane ? a.lane.walls.map((w) => w.points) : []))
  // Hits on this lane's walls, from its own ball paths and from those of
  // joined or fed lanes that run through it.
  const hits = shotAnalyses()
    .filter((a) => a.parts.some((p) => p.id === shotId))
    .flatMap((a) =>
      a.flippers.flatMap((f) =>
        Object.values(f.states).flatMap((s) =>
          (s?.lane?.bounces ?? []).flatMap((hit) => {
            const at = contactWall(a, hit)
            return at?.id === shotId ? [{ hit, at }] : []
          }),
        ),
      ),
    )

  const suggested = WALL_SIDES.map(({ side, offset }) => {
    const wall = lane.walls.find((w) => w.side === side)!
    const total = wall.lengths.at(-1) ?? 0
    if (total <= 0) return { side, mounts: [] }

    // Hardest hit expected at each point of the wall.
    const load = wall.lengths.map(() => NOMINAL_HIT)
    for (const { hit, at } of hits) {
      if (at.offset !== offset) continue
      const along = wall.lengths[at.index]
      wall.lengths.forEach((l, i) => {
        if (Math.abs(l - along) <= HIT_SPREAD) load[i] = Math.max(load[i], hit.normalSpeed)
      })
    }

    const nearest = (distance: number) => {
      let best = 0
      wall.lengths.forEach((l, i) => {
        if (Math.abs(l - distance) < Math.abs(wall.lengths[best] - distance)) best = i
      })
      return best
    }
    // A spade bolt fits unless a side rail or another wall is close outside.
    const kindAt = (i: number): MountKind => {
      const p = wall.points[i]
      const n = normal(lane.center[i].t)
      const out = { x: n.x * offset, y: n.y * offset }
      const reach = { x: p.x + out.x * SPADE_CLEARANCE, y: p.y + out.y * SPADE_CLEARANCE }
      if (reach.x < playfield.sideRail || reach.x > playfield.width - playfield.sideRail) return 'spike'
      const crowded = others.some((points) =>
        points.some((q) => {
          const ahead = (q.x - p.x) * out.x + (q.y - p.y) * out.y
          return ahead > 0 && Math.hypot(q.x - p.x, q.y - p.y) < SPADE_CLEARANCE
        }),
      )
      return crowded ? 'spike' : 'spade'
    }
    // Each separate piece of wall, either side of an open span, is held at both ends.
    const ends = lane.pieces.flatMap(([first, last]) => {
      const from = wall.lengths[first]
      const to = wall.lengths[last]
      const middle = (from + to) / 2
      return [nearest(Math.min(from + END_INSET, middle)), nearest(Math.max(to - END_INSET, middle))]
    })
    const placed: Placed[] = [...new Set(ends)].map((index) => ({ kind: kindAt(index), index }))

    while (placed.length < MAX_MOUNTS) {
      const stiffness = piecewiseStiffness(wall.points, placed, lane.pieces, walls)
      let worst = -1
      let worstFlex = MAX_FLEX
      stiffness.forEach((k, i) => {
        const flex = load[i] * flexPerSpeed(k, mass)
        if (flex > worstFlex) {
          worst = i
          worstFlex = flex
        }
      })
      if (worst < 0) break

      // Already as stiff as it can be made there.
      if (placed.some((m) => Math.abs(wall.lengths[m.index] - wall.lengths[worst]) < MIN_GAP)) break
      placed.push({ kind: kindAt(worst), index: worst })
    }

    const mounts: WallMount[] = placed
      .map((m) => newMount(m.kind, wall.lengths[m.index] / total))
      .sort((a, b) => a.at - b.at)
    return { side, mounts }
  })

  // Both walls change together, so the lane is solved again once.
  batch(() => suggested.forEach(({ side, mounts }) => setMounts(shotId, side, mounts)))
}
