import { batch } from 'solid-js'
import { ball } from './ball'
import { playfield } from './playfield'
import {
  addVia,
  exitForHorseshoe,
  horseshoeCenter,
  HORSESHOE_ROTATION,
  moveVia,
  setExit,
  setHorseshoe,
  shots,
  updateShot,
  type LaneAlignment,
  type Shot,
} from './shots'
import { analyze, inflowOf, type ShotAnalysis } from './solutions'
import { MAX_FLEX } from '../physics/wall'
import type { CurveSample, LaneOutcome, LaneRun } from '../geometry/lane'

// Smoothen reshapes the lane between its fixed ends, trying the settings
// that don't move the entrance, exit, widths or mounts. Bend points move,
// but only so far, so the lane still goes where it was drawn.
//
// A horseshoe's fixed end is the turn itself: its center and the direction
// the ball leaves in. Where the lane meets the turn slides around it, and a
// bend point is tried before the exit to lead the ball into it, as an
// easement would.
//
// Each end the ball is shot into can pivot away from the ball as well as
// sit off to one side of it. The two work together, a pivot swinging the
// lane about where the ball crosses the mouth and the offset moving it
// across, so they're first searched together on a coarse grid, then
// nudged with the rest. A pivot costs a little, so the lane only turns
// from the ball where that buys a smoother ride.
type Params = Pick<
  Shot,
  | 'entranceOffset'
  | 'entrancePivot'
  | 'leadIn'
  | 'entranceWeight'
  | 'exitWeight'
  | 'exitOffset'
  | 'exitPivot'
  | 'funnelLength'
  | 'via'
  | 'exit'
  | 'horseshoe'
>

const OUTCOME_COST: Record<LaneOutcome, number> = {
  smooth: 0,
  chatter: 100,
  ricochet: 200,
  rattle: 300,
  stalls: 400,
  misses: 400,
}
// Cost per in/s the ball bounces off a wall, and per inch a hit flexes the
// wall past MAX_FLEX.
const REBOUND_COST = 1
const FLEX_COST = 1000
// Cost per inch a wall runs past the side rail, and of a bend so tight the
// inner wall folds over. Either makes the lane unbuildable.
const RAIL_COST = 1000
const FOLD_COST = 500
// The path the entrance is lined up with is the one the lane is for.
const ALIGNED_WEIGHT = 2
// Closest the entrance offset comes to the most it can be, inches, either way.
const OFFSET_MARGIN = 0.2
// Furthest an end pivots from the ball, degrees, either way; the cost per
// degree it does, as much as a bounce back off a wall at 1 in/s; and the
// pivots and fractions of the offset reach tried together to start from.
const PIVOT_REACH = 30
const PIVOT_COST = 1
const SEED_PIVOTS = [-20, -15, -10, -5, 0, 5, 10, 15, 20]
const SEED_OFFSETS = [-1, -0.5, 0, 0.5, 1]
const PIVOT_PRECISION = 0.5
// Furthest a bend point moves from where it was, inches, either way.
const VIA_REACH = 2
// Furthest a bend point added to lead into a horseshoe moves from where it
// starts on the lane, inches, either way, and how far back from the exit
// it starts, in horseshoe radii, at most halfway along the last stretch.
const APPROACH_REACH = 3
const APPROACH_RADII = 2
// Of MAX_EVALUATIONS, how many are kept back for trying that bend point.
const APPROACH_EVALUATIONS = 150
// Furthest the lane's meeting point slides around a horseshoe, degrees,
// either way, and the least turn the horseshoe is left with.
const ENTRY_REACH = 90
const MIN_TURN = 15
// Most lane shapes to try, to keep the click responsive.
const MAX_EVALUATIONS = 400
// Stop once every step has shrunk below this fraction of its start.
const MIN_STEP_FRACTION = 1 / 16
// Settings are rounded to these, so they read cleanly in the fields.
const INCH_PRECISION = 1 / 64
const WEIGHT_PRECISION = 0.01

const snap = (value: number, precision: number) => +(Math.round(value / precision) * precision).toFixed(6)

const runCost = (run: LaneRun | null) => {
  if (!run) return OUTCOME_COST.stalls
  let cost = OUTCOME_COST[run.outcome]
  for (const b of run.bounces) cost += REBOUND_COST * b.reboundSpeed + FLEX_COST * Math.max(0, b.flex - MAX_FLEX)
  return cost
}

/** How rough a shot's ball paths are through its lane; lower is better. */
export function roughness(shot: Shot, analysis: ShotAnalysis): number {
  const lane = analysis.lane
  if (!lane) return Infinity
  let cost = RAIL_COST * lane.overRail
  if (lane.tightest.radius < Math.max(shot.entranceWidth, shot.exitWidth) / 2) cost += FOLD_COST
  for (const run of analysis.runs) {
    // A split end is for both the paths it's lined up between.
    const aligned =
      run.end === 'entrance' ? [lane.alignedTo, lane.splitWith] : [lane.exitAlignedTo, lane.exitSplitWith]
    for (const f of run.flippers) {
      for (const [state, s] of Object.entries(f.states)) {
        if (!s) continue
        cost += runCost(s.lane) * (aligned.includes(`${f.key}-${state}` as LaneAlignment) ? ALIGNED_WEIGHT : 1)
      }
    }
  }
  return cost
}

/** Paths through the lane, into either end, that aren't smooth. */
const roughPaths = (analysis: ShotAnalysis) =>
  analysis.runs.flatMap((run) => run.flippers).reduce(
    (n, f) => n + Object.values(f.states).filter((s) => s && (!s.lane || s.lane.outcome !== 'smooth')).length,
    0,
  )

// `stale` when the shot changed during the search, so nothing was applied.
export type SmoothenResult = { before: number; after: number; changed: boolean; addedVia: boolean; stale: boolean }

// Longest the search holds the thread before letting the page update, ms.
const YIELD_INTERVAL = 12

type Knob = {
  get: (p: Params) => number
  set: (p: Params, v: number) => Params
  min: number
  max: number
  step: number
  precision: number
}

/** Bend point ids not yet in the store; `addVia` gives them real ones. */
const NEW_VIA_ID = -1

const wrapDegrees = (angle: number) => {
  const a = ((((angle + 180) % 360) + 360) % 360) - 180
  return a === -180 ? 180 : a
}

/**
 * Reshape a shot's lane to get the ball through it more cleanly, by
 * coordinate descent: nudge one setting at a time either way, keep any nudge
 * that makes the shot less rough, and halve the nudges once none helps. A
 * lane ending in a horseshoe is tried again with a bend point added before
 * the exit, which is kept if it does better.
 *
 * Runs in slices so the page stays responsive, reporting the lane shapes
 * tried so far out of the most it will try.
 */
export async function smoothen(
  shotId: number,
  onProgress?: (tried: number, most: number) => void,
): Promise<SmoothenResult | null> {
  const live = shots.find((s) => s.id === shotId)
  if (!live) return null
  // The shot can be edited while the search runs, so it works from a copy.
  const snapshot = JSON.stringify(live)
  const shot: Shot = {
    ...live,
    entrance: { ...live.entrance },
    exit: { ...live.exit },
    via: live.via.map((v) => ({ ...v })),
    mounts: { left: live.mounts.left.map((m) => ({ ...m })), right: live.mounts.right.map((m) => ({ ...m })) },
    horseshoe: { ...live.horseshoe },
    exitOrigin: { ...live.exitOrigin },
  }
  // Lanes feeding either end are left as they are; the ball still runs
  // through them.
  const inflow = inflowOf(live)
  const exitInflow = live.end === 'double' ? inflowOf(live, 'exit') : null
  const double = shot.end === 'double'
  const evaluate = (params: Params) => {
    const candidate = { ...shot, ...params }
    const analysis = analyze(candidate, inflow, exitInflow)
    const pivot = Math.abs(params.entrancePivot) + (double ? Math.abs(params.exitPivot) : 0)
    return { cost: roughness(candidate, analysis) + PIVOT_COST * pivot, analysis }
  }

  const initial: Params = {
    entranceOffset: shot.entranceOffset,
    entrancePivot: shot.entrancePivot,
    leadIn: shot.leadIn,
    entranceWeight: shot.entranceWeight,
    exitWeight: shot.exitWeight,
    exitOffset: shot.exitOffset,
    exitPivot: shot.exitPivot,
    funnelLength: shot.funnelLength,
    via: shot.via.map((v) => ({ ...v })),
    exit: { ...shot.exit },
    horseshoe: { ...shot.horseshoe },
  }
  const start = evaluate(initial)
  const lane = start.analysis.lane
  if (!lane) return null
  // The funnel is searched as a length within the lane; the far end means
  // the whole lane, however long it ends up.
  const laneLength = lane.exitDistance
  // Each end is kept back from the most it can be offset.
  const offsetReach = (width: number) => Math.max(0, width / 2 - ball.diameter / 2 - OFFSET_MARGIN)
  const horseshoe = shot.end === 'horseshoe'

  // How each end the ball is shot into sits on the ball: off to one side
  // and turned from it. A double-ended lane's exit only has a ball to sit on
  // while one lines up with it.
  type EndKnobs = { offset: Knob; pivot: Knob; reach: number }
  const endKnobs = (offset: 'entranceOffset' | 'exitOffset', pivot: 'entrancePivot' | 'exitPivot', width: number) => {
    const reach = offsetReach(width)
    return {
      offset: {
        get: (p) => p[offset],
        set: (p, v) => ({ ...p, [offset]: v }),
        min: -reach,
        max: reach,
        step: reach / 4,
        precision: INCH_PRECISION,
      },
      pivot: {
        get: (p) => p[pivot],
        set: (p, v) => ({ ...p, [pivot]: v }),
        // A pivot set further by hand can still come back in.
        min: Math.min(-PIVOT_REACH, shot[pivot]),
        max: Math.max(PIVOT_REACH, shot[pivot]),
        step: 5,
        precision: PIVOT_PRECISION,
      },
      reach,
    } satisfies EndKnobs
  }
  const ends: EndKnobs[] = [
    endKnobs('entranceOffset', 'entrancePivot', shot.entranceWidth),
    ...(double && lane.exitLinedUp ? [endKnobs('exitOffset', 'exitPivot', shot.exitWidth)] : []),
  ]

  const viaKnobs = (via: Params['via'], reach: (i: number) => number): Knob[] =>
    via.flatMap((point, i): Knob[] =>
      (['x', 'y'] as const).map((axis) => ({
        get: (p) => p.via[i][axis],
        set: (p, v) => ({ ...p, via: p.via.map((q, j) => (j === i ? { ...q, [axis]: v } : q)) }),
        min: Math.max(0, point[axis] - reach(i)),
        max: Math.min(axis === 'x' ? playfield.width : playfield.height, point[axis] + reach(i)),
        step: reach(i) / 4,
        precision: INCH_PRECISION,
      })),
    )

  const knobs: Knob[] = [
    ...ends.flatMap((end) => [end.offset, end.pivot]),
    { get: (p) => p.leadIn, set: (p, v) => ({ ...p, leadIn: v }), min: 0, max: 8, step: 1, precision: INCH_PRECISION },
    {
      get: (p) => p.entranceWeight,
      set: (p, v) => ({ ...p, entranceWeight: v }),
      min: 0.1,
      max: 5,
      step: 0.4,
      precision: WEIGHT_PRECISION,
    },
    {
      get: (p) => p.exitWeight,
      set: (p, v) => ({ ...p, exitWeight: v }),
      min: 0.1,
      max: 5,
      step: 0.4,
      precision: WEIGHT_PRECISION,
    },
    {
      get: (p) => Math.min(p.funnelLength, laneLength),
      set: (p, v) => ({ ...p, funnelLength: v >= laneLength ? Infinity : v }),
      min: 0,
      max: laneLength,
      step: laneLength / 4,
      precision: INCH_PRECISION,
    },
  ]

  if (horseshoe) {
    // Slide where the lane meets the turn around it, holding the turn's
    // center and the direction out of it: the exit swings around the
    // center and the turn takes up whatever the exit direction gives.
    const center = horseshoeCenter(shot)
    const out = shot.exit.angle + shot.horseshoe.rotation
    const side = shot.horseshoe.rotation >= 0 ? 1 : -1
    // Rotation is `out` less the exit angle, kept turning the same way.
    const [low, high] =
      side > 0
        ? [out - HORSESHOE_ROTATION.max, out - MIN_TURN]
        : [out + MIN_TURN, out - HORSESHOE_ROTATION.min]
    knobs.push({
      get: (p) => p.exit.angle,
      set: (p, angle) => {
        const turned = { ...shot, exit: { ...p.exit, angle }, horseshoe: { ...p.horseshoe, rotation: out - angle } }
        return { ...p, exit: { ...exitForHorseshoe(turned, center), angle }, horseshoe: turned.horseshoe }
      },
      min: Math.max(low, shot.exit.angle - ENTRY_REACH),
      max: Math.min(high, shot.exit.angle + ENTRY_REACH),
      step: 15,
      precision: 1,
    })
  }

  // Lane shapes tried so far, across the seeding and both searches, and
  // the most there'll be.
  let evaluations = 0
  const seeds = ends.length * SEED_PIVOTS.length * SEED_OFFSETS.length
  const most = seeds + MAX_EVALUATIONS
  // Hands the browser back the thread now and then, so the page can show
  // the search going on.
  let lastYield = performance.now()
  const breathe = async () => {
    if (performance.now() - lastYield < YIELD_INTERVAL) return
    onProgress?.(evaluations, most)
    await new Promise((resolve) => setTimeout(resolve, 0))
    lastYield = performance.now()
  }

  const descend = async (from: Params, knobs: Knob[], budget: number) => {
    let best = from
    let { cost: bestCost, analysis: bestAnalysis } = evaluate(from)
    const steps = knobs.map((k) => k.step)

    // Nothing beats a lane with no rough paths at all.
    while (bestCost > 0 && evaluations < budget && steps.some((s, i) => s >= knobs[i].step * MIN_STEP_FRACTION)) {
      let improved = false
      for (const [i, knob] of knobs.entries()) {
        if (steps[i] < knob.step * MIN_STEP_FRACTION || steps[i] === 0) continue
        for (const dir of [1, -1]) {
          const value = Math.min(knob.max, Math.max(knob.min, snap(knob.get(best) + dir * steps[i], knob.precision)))
          if (value === knob.get(best) || bestCost === 0 || evaluations >= budget) continue
          const candidate = knob.set(best, value)
          const result = evaluate(candidate)
          evaluations++
          await breathe()
          if (result.cost < bestCost) {
            best = candidate
            bestCost = result.cost
            bestAnalysis = result.analysis
            improved = true
            break
          }
        }
      }
      if (!improved) steps.forEach((s, i) => (steps[i] = s / 2))
    }
    return { params: best, cost: bestCost, analysis: bestAnalysis }
  }

  // Pivot and offset each end together over a coarse grid, one end after
  // the other, to start the search from the best of them. Nudged one at a
  // time from where they're set, either alone would often make things
  // worse where the two together would help.
  let seeded = initial
  let seededCost = start.cost
  for (const end of ends) {
    const from = seeded
    for (const pivot of SEED_PIVOTS) {
      for (const fraction of SEED_OFFSETS) {
        if (seededCost === 0) break
        const offset = snap(fraction * end.reach, INCH_PRECISION)
        const candidate = end.pivot.set(end.offset.set(from, offset), pivot)
        const { cost } = evaluate(candidate)
        evaluations++
        await breathe()
        if (cost < seededCost) {
          seeded = candidate
          seededCost = cost
        }
      }
    }
  }
  // Seeding stops early on a lane with no rough paths; the searches get its share either way.
  evaluations = seeds

  // A horseshoe lane saves some of the budget for trying a bend point.
  let result = await descend(
    seeded,
    [...knobs, ...viaKnobs(initial.via, () => VIA_REACH)],
    horseshoe ? most - APPROACH_EVALUATIONS : most,
  )
  let addedVia = false

  if (horseshoe && result.cost > 0) {
    // Carry on from the best lane so far with a bend point on it, partway
    // back along the last stretch, which starts at the last bend point.
    const center = result.analysis.lane!.center
    const exitDistance = result.analysis.lane!.exitDistance
    const nearest = (score: (q: CurveSample) => number) =>
      center.reduce((best, q) => (score(q) < score(best) ? q : best))
    const last = result.params.via.at(-1)
    const stretchStart = last ? nearest((q) => Math.hypot(q.p.x - last.x, q.p.y - (playfield.height - last.y))).s : 0
    const target = exitDistance - Math.min(APPROACH_RADII * shot.horseshoe.radius, (exitDistance - stretchStart) / 2)
    const at = nearest((q) => Math.abs(q.s - target))
    const point = {
      id: NEW_VIA_ID,
      x: snap(at.p.x, INCH_PRECISION),
      y: snap(playfield.height - at.p.y, INCH_PRECISION),
      weight: 1,
    }
    // Bend points already there keep to their reach from where they were drawn.
    const withPoint = await descend(
      { ...result.params, via: [...result.params.via, point] },
      [...knobs, ...viaKnobs([...initial.via, point], (i) => (i === initial.via.length ? APPROACH_REACH : VIA_REACH))],
      most,
    )
    if (withPoint.cost < result.cost) {
      result = withPoint
      addedVia = true
    }
  }

  // Reshaped while the search ran: its answer is for a lane that's gone.
  const now = shots.find((s) => s.id === shotId)
  if (!now || JSON.stringify(now) !== snapshot) return { before: 0, after: 0, changed: false, addedVia: false, stale: true }

  const changed = result.cost < start.cost
  if (changed) {
    const { via, exit, horseshoe: turn, ...rest } = result.params
    batch(() => {
      updateShot(shotId, rest)
      via.forEach(({ id, x, y }, i) => (id === NEW_VIA_ID ? addVia(shotId, i, { x, y }) : moveVia(shotId, id, { x, y })))
      if (horseshoe) {
        setExit(shotId, { ...exit, angle: wrapDegrees(exit.angle) })
        setHorseshoe(shotId, { rotation: turn.rotation })
      }
    })
  }
  return {
    before: roughPaths(start.analysis),
    after: roughPaths(result.analysis),
    changed,
    addedVia: changed && addedVia,
    stale: false,
  }
}
