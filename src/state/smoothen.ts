import { batch } from 'solid-js'
import { ball } from './ball'
import { playfield } from './playfield'
import { moveVia, shots, updateShot, type Shot } from './shots'
import { analyze, joinedLane, solveFlippers, type FlipperSolutions, type ShotAnalysis } from './solutions'
import { MAX_FLEX } from '../physics/wall'
import type { LaneOutcome, LaneRun } from '../geometry/lane'

// Smoothen reshapes the lane between its fixed ends, trying the settings
// that don't move the entrance, exit, widths or mounts. Bend points move,
// but only so far, so the lane still goes where it was drawn.
type Params = Pick<Shot, 'entranceOffset' | 'leadIn' | 'entranceWeight' | 'exitWeight' | 'funnelLength' | 'via'>

const OUTCOME_COST: Record<LaneOutcome, number> = {
  smooth: 0,
  chatter: 100,
  ricochet: 200,
  rattle: 300,
  stalls: 400,
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
// Furthest a bend point moves from where it was, inches, either way.
const VIA_REACH = 2
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
  for (const f of analysis.flippers) {
    for (const [state, s] of Object.entries(f.states)) {
      if (!s) continue
      cost += runCost(s.lane) * (`${f.approach}-${state}` === lane.alignedTo ? ALIGNED_WEIGHT : 1)
    }
  }
  return cost
}

/** Paths through the lane that aren't smooth. */
const roughPaths = (analysis: ShotAnalysis) =>
  analysis.flippers.reduce(
    (n, f) => n + Object.values(f.states).filter((s) => s && (!s.lane || s.lane.outcome !== 'smooth')).length,
    0,
  )

export type SmoothenResult = { before: number; after: number; changed: boolean }

/**
 * Reshape a shot's lane to get the ball through it more cleanly, by
 * coordinate descent: nudge one setting at a time either way, keep any nudge
 * that makes the shot less rough, and halve the nudges once none helps.
 */
export function smoothen(shotId: number): SmoothenResult | null {
  const shot = shots.find((s) => s.id === shotId)
  if (!shot) return null
  const solved: FlipperSolutions[] = solveFlippers(shot)
  // A joined lane is left as it is; the ball still runs on through it.
  const joined = joinedLane(shotId)
  const evaluate = (params: Params) => {
    const candidate = { ...shot, ...params }
    const analysis = analyze(candidate, solved, joined)
    return { cost: roughness(candidate, analysis), analysis }
  }

  const start = evaluate(shot)
  if (!start.analysis.lane) return null
  // The funnel is searched as a length within the lane; the far end means
  // the whole lane, however long it ends up.
  const laneLength = start.analysis.lane.center.at(-1)!.s
  const maxOffset = Math.max(0, shot.entranceWidth / 2 - ball.diameter / 2)

  type Knob = {
    get: (p: Params) => number
    set: (p: Params, v: number) => Params
    min: number
    max: number
    step: number
    precision: number
  }
  const knobs: Knob[] = [
    {
      get: (p) => p.entranceOffset,
      set: (p, v) => ({ ...p, entranceOffset: v }),
      min: -maxOffset,
      max: maxOffset,
      step: maxOffset / 4,
      precision: INCH_PRECISION,
    },
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
    ...shot.via.flatMap((point, i): Knob[] =>
      (['x', 'y'] as const).map((axis) => ({
        get: (p) => p.via[i][axis],
        set: (p, v) => ({ ...p, via: p.via.map((q, j) => (j === i ? { ...q, [axis]: v } : q)) }),
        min: Math.max(0, point[axis] - VIA_REACH),
        max: Math.min(axis === 'x' ? playfield.width : playfield.height, point[axis] + VIA_REACH),
        step: VIA_REACH / 4,
        precision: INCH_PRECISION,
      })),
    ),
  ]

  let best: Params = {
    entranceOffset: shot.entranceOffset,
    leadIn: shot.leadIn,
    entranceWeight: shot.entranceWeight,
    exitWeight: shot.exitWeight,
    funnelLength: shot.funnelLength,
    via: shot.via.map((v) => ({ ...v })),
  }
  let bestCost = start.cost
  let bestAnalysis = start.analysis
  const steps = knobs.map((k) => k.step)
  let evaluations = 0

  // Nothing beats a lane with no rough paths at all.
  while (bestCost > 0 && evaluations < MAX_EVALUATIONS && steps.some((s, i) => s >= knobs[i].step * MIN_STEP_FRACTION)) {
    let improved = false
    knobs.forEach((knob, i) => {
      if (steps[i] < knob.step * MIN_STEP_FRACTION || steps[i] === 0) return
      for (const dir of [1, -1]) {
        const value = Math.min(knob.max, Math.max(knob.min, snap(knob.get(best) + dir * steps[i], knob.precision)))
        if (value === knob.get(best) || bestCost === 0 || evaluations >= MAX_EVALUATIONS) continue
        const candidate = knob.set(best, value)
        const result = evaluate(candidate)
        evaluations++
        if (result.cost < bestCost) {
          best = candidate
          bestCost = result.cost
          bestAnalysis = result.analysis
          improved = true
          break
        }
      }
    })
    if (!improved) steps.forEach((s, i) => (steps[i] = s / 2))
  }

  const changed = bestCost < start.cost
  if (changed) {
    const { via, ...rest } = best
    batch(() => {
      updateShot(shotId, rest)
      via.forEach(({ id, x, y }) => moveVia(shotId, id, { x, y }))
    })
  }
  return { before: roughPaths(start.analysis), after: roughPaths(bestAnalysis), changed }
}
