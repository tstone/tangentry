import { ball } from './ball'
import { playfield } from './playfield'
import { reserved } from './reserved'
import { safeTravelRegions } from './safeTravel'
import {
  DEFAULT_HORSESHOE,
  HORSESHOE_ROTATION,
  HORSESHOE_RADIUS,
  shotDefaults,
  shots,
  type Entrance,
  type Exit,
  type Horseshoe,
  type Shot,
} from './shots'
import {
  alignedSolution,
  analyze,
  laneOutlines,
  shotAlignment,
  shotAnalyses,
  solveFlippers,
  type Feeder,
  type FlipperSolutions,
  type Lane,
} from './solutions'
import { roughness } from './smoothen'
import { convexHull } from '../geometry/hull'
import { insidePolygon, segmentDistance } from '../geometry/overlap'
import type { Point } from '../geometry/flipper'

// Fitting turns a freehand stroke, in SVG coordinates, into a shot whose
// lane follows it. The stroke is smoothed, the end the ball can be shot
// into becomes the entrance, and the lane's ends, weights, lead-in and a
// few bend points are searched for a lane that stays near the stroke and
// gets the ball through cleanly. The ends may wander a little from where
// they were drawn: a sketch is only rough.
//
// A stroke that turns tightly back on itself at its far end, too tight
// for a lane to follow, ends in a horseshoe instead: the lane is fitted up
// to where the turn starts, and the horseshoe to the turn.
//
// If that lane crosses space the ball needs clear to reach other shots, or
// another lane, it's steered clear if it can be without straying far from
// the stroke. Otherwise it's made a ramp if the crossing is short, or cut
// where it crosses if it's long: each piece becomes a shot of its own, fed
// by the one before, and is fitted again to catch the ball coming out of it.

// Spacing of samples along a stroke once it's evened out, inches.
const SPACING = 0.2
// Half-width of the moving average that smooths a stroke, in samples. It's
// run twice.
const SMOOTH_SAMPLES = 4
// Shortest stroke that makes a lane, inches.
const MIN_STROKE = 3
// How far back from each end of a stroke its direction there is taken, inches.
const END_TANGENT = 1.5
// Choosing which end is the entrance, how much worse (radians) the stroke
// has to line up with the ball drawn forward before it's turned around.
const REVERSE_BIAS = 0.2

// Cost per inch the lane strays from the stroke on average, and per inch at
// its furthest from it.
const FIT_COST = 300
const WORST_COST = 50
// Weight on how roughly the ball gets through, as smoothen measures it.
// Following the sketch comes first; smoothen can clean up after.
const ROUGH_WEIGHT = 0.1
// Cost of each ball path that flies across the gap from the lane feeding
// this one and misses its walls, which makes the lane useless for it.
const MISS_COST = 150
// Cost per inch of lane over space the ball needs clear, over another
// lane, and over a reserved area.
const SAFE_COST = 60
const LANE_COST = 100
const RESERVED_COST = 200
// A piece of a cut lane is there to leave that space clear, so it costs far
// more for one to creep back over it.
const CUT_SAFE_COST = 1000
// Room kept between a lane's walls and space the ball needs clear, or
// another lane's walls, inches.
const SAFE_MARGIN = 0.125
const LANE_MARGIN = 0.125

// Furthest the search moves each end and each bend point from where it
// started, inches, and turns the exit from the stroke's direction, degrees.
const END_REACH = 1.5
const VIA_REACH = 2
const ANGLE_REACH = 45
// Bend points are added at the stroke's furthest point from the lane, while
// that's further than this (inches), up to MAX_VIA, and only while each
// makes the lane better by at least VIA_GAIN.
const VIA_TOLERANCE = 0.35
const MAX_VIA = 4
const VIA_GAIN = 5
// Bend points aren't added this close to either end of the stroke, inches.
const VIA_END_CLEARANCE = 1.5

// A lane steered off what it crosses is kept only if it strays no further
// than this from the stroke, inches, on average and at most.
const AVOID_MEAN = 0.6
const AVOID_WORST = 1.5

// Lane shapes tried for each set of bend points, to steer the lane clear of
// what it crosses, and to fit it again around where it's cut. Each piece of
// a cut lane gets REFINE_BUDGET, so more pieces can run over STROKE_BUDGET.
const STAGE_BUDGET = 120
const AVOID_BUDGET = 150
const REFINE_BUDGET = 100
const STROKE_BUDGET = STAGE_BUDGET * (MAX_VIA + 1) + AVOID_BUDGET + REFINE_BUDGET
const MIN_STEP_FRACTION = 1 / 16

// Crossings no longer than this become a ramp; longer ones cut the lane, inches.
const RAMP_SPAN = 5
// Crossings closer together than this count as one, inches, and each cut
// runs this far past its crossing either side.
const SPAN_MERGE = 0.5
const SPAN_PAD = 0.25
// Shortest piece of lane left between cuts, or at either end, inches.
const MIN_PIECE = 2
// Least lane a cut one keeps, inches and as a fraction of its length; with
// less it's made a ramp instead.
const MIN_WALLED = 3
const MIN_WALLED_FRACTION = 1 / 3

// A turn at the far end of a stroke is taken as a horseshoe if it turns at
// least HOOK_TURN (degrees) within HOOK_RADIUS (inches). It must start
// within HOOK_REACH of the end, with no more than HOOK_TRAIL of stroke
// past it, inches. Gentle bending up to HOOK_TRIM (degrees) is trimmed off
// either side, leaving the tight part.
const HOOK_TURN = 135
const HOOK_RADIUS = 4
const HOOK_REACH = 16
const HOOK_TRAIL = 4
const HOOK_TRIM = 15

const INCH_PRECISION = 1 / 16
const WEIGHT_PRECISION = 0.05

// Longest the search holds the thread before letting the page update, ms.
const YIELD_INTERVAL = 12

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)
const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
const unit = (a: Point): Point => {
  const length = Math.hypot(a.x, a.y) || 1
  return { x: a.x / length, y: a.y / length }
}
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const snap = (value: number, precision: number) => +(Math.round(value / precision) * precision).toFixed(6)

const toSvg = (p: Entrance): Point => ({ x: p.x, y: playfield.height - p.y })
const toPlayfield = (p: Point): Entrance => ({ x: p.x, y: playfield.height - p.y })

const strokeLength = (points: Point[]) => points.reduce((sum, p, i) => sum + (i > 0 ? dist(points[i - 1], p) : 0), 0)

/** Points evenly `spacing` apart along a polyline, keeping both ends. */
function resample(points: Point[], spacing: number): Point[] {
  if (points.length < 2) return points.slice()
  const out = [points[0]]
  // Distance travelled since the last point kept.
  let carry = 0
  for (let i = 1; i < points.length; i++) {
    let a = points[i - 1]
    const b = points[i]
    let left = dist(a, b)
    while (carry + left >= spacing) {
      a = lerp(a, b, (spacing - carry) / left)
      out.push(a)
      left = dist(a, b)
      carry = 0
    }
    carry += left
  }
  const last = points[points.length - 1]
  if (dist(out[out.length - 1], last) > spacing / 4) out.push(last)
  return out
}

/** Moving average, narrowing toward the ends so they stay where they were drawn. */
function smooth(points: Point[], radius: number): Point[] {
  const n = points.length
  return points.map((_, i) => {
    const k = Math.min(radius, i, n - 1 - i)
    let x = 0
    let y = 0
    for (let j = i - k; j <= i + k; j++) {
      x += points[j].x
      y += points[j].y
    }
    return { x: x / (2 * k + 1), y: y / (2 * k + 1) }
  })
}

/** Direction a stroke sets off in from its start, over its first `length` inches. */
function startDirection(points: Point[], length = END_TANGENT) {
  const i = Math.min(points.length - 1, Math.max(1, Math.round(length / SPACING)))
  return unit({ x: points[i].x - points[0].x, y: points[i].y - points[0].y })
}

// A tight turn at the far end of a stroke: the samples it starts and ends
// at, and the horseshoe that would make it.
type Hook = { start: number; end: number; horseshoe: Horseshoe }

/** The tight turn a stroke (evenly spaced) ends in, if it ends in one. */
function findHook(points: Point[]): Hook | null {
  // Heading of each step along the stroke, unwrapped so turns add up. On
  // screen y is flipped, so a rising heading turns right.
  const heading: number[] = []
  for (let i = 0; i < points.length - 1; i++) {
    let h = Math.atan2(points[i + 1].y - points[i].y, points[i + 1].x - points[i].x)
    if (i > 0) h += 2 * Math.PI * Math.round((heading[i - 1] - h) / (2 * Math.PI))
    heading.push(h)
  }
  const last = heading.length - 1
  // The lane before the turn has to be long enough to make a lane.
  const from = Math.max(Math.round(MIN_STROKE / SPACING), last - Math.round(HOOK_REACH / SPACING))
  if (from >= last) return null
  // The most the heading turns, either way, between two steps near the end.
  let most = { turn: 0, start: from, end: from }
  let low = from
  let high = from
  for (let j = from; j <= last; j++) {
    if (heading[j] < heading[low]) low = j
    if (heading[j] > heading[high]) high = j
    for (const i of [low, high]) {
      const turn = heading[j] - heading[i]
      if (Math.abs(turn) > Math.abs(most.turn)) most = { turn, start: i, end: j }
    }
  }
  const total = Math.abs(most.turn)
  if (total < (HOOK_TURN * Math.PI) / 180 || (last - most.end) * SPACING > HOOK_TRAIL) return null
  const sign = Math.sign(most.turn)
  const turned = (i: number, j: number) => sign * (heading[j] - heading[i])
  // Steps bending gentler than twice the widest horseshoe are trimmed off,
  // judged a few steps at a time to ride out wobbles in the stroke.
  const span = 3
  const gentle = (span * SPACING) / (2 * HOOK_RADIUS)
  const trim = (HOOK_TRIM * Math.PI) / 180
  let { start, end } = most
  while (start + span < end && turned(start, start + span) < gentle && turned(start + 1, end) >= total - trim) start++
  while (end - span > start && turned(end - span, end) < gentle && turned(start, end - 1) >= total - 2 * trim) end--
  const sweep = Math.min(turned(start, end), (HORSESHOE_ROTATION.max * Math.PI) / 180)
  // The radius of a circular turn through the same sweep between its ends.
  const radius = dist(points[start], points[end + 1]) / (2 * Math.sin(sweep / 2))
  if (radius > HOOK_RADIUS) return null
  return {
    start,
    end: end + 1,
    horseshoe: {
      // A right turn on screen is a negative rotation.
      rotation: -sign * Math.round((sweep * 180) / Math.PI),
      radius: snap(Math.max(HORSESHOE_RADIUS.min, radius), INCH_PRECISION),
    },
  }
}

/**
 * Strokes drawn in one color, joined end to end in the order they were
 * drawn. Each is turned around if its far end is nearer where the last left off.
 */
export function joinStrokes(strokes: Point[][]): Point[] {
  const joined: Point[] = []
  for (const stroke of strokes) {
    if (stroke.length === 0) continue
    const end = joined[joined.length - 1]
    const flip = end !== undefined && dist(end, stroke[stroke.length - 1]) < dist(end, stroke[0])
    joined.push(...(flip ? [...stroke].reverse() : stroke))
  }
  return joined
}

type Kind = 'safe' | 'lane' | 'reserved'
const KINDS: Kind[] = ['safe', 'lane', 'reserved']

// Something a lane should keep off, in SVG coordinates: space the ball
// needs clear, another lane's walls, or a reserved area. A lane's walls
// should stay `clearance` from its outline.
type Obstacle = {
  kind: Kind
  polygon: Point[]
  clearance: number
  box: { left: number; right: number; top: number; bottom: number }
  // Which stroke's lane it is, for lanes being fitted alongside.
  owner?: number
}

function obstacle(kind: Kind, polygon: Point[], clearance: number, owner?: number): Obstacle {
  const xs = polygon.map((p) => p.x)
  const ys = polygon.map((p) => p.y)
  return {
    kind,
    polygon,
    clearance,
    owner,
    box: { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) },
  }
}

// Corners on the outline of a circular reserved area.
const CIRCLE_CORNERS = 24
// Every how many points of another lane's outline are kept, since its walls
// are sampled far finer than needed to steer clear of them.
const OUTLINE_STRIDE = 4

const decimate = (points: Point[], stride: number) =>
  points.filter((_, i) => i % stride === 0 || i === points.length - 1)

/** Outlines of a lane's walls, to keep other lanes off of. */
const laneObstacles = (lane: Lane, owner?: number) =>
  laneOutlines(lane).map((outline) => obstacle('lane', decimate(outline, OUTLINE_STRIDE), LANE_MARGIN, owner))

function reservedObstacles(): Obstacle[] {
  return reserved.map((area) => {
    if (area.kind === 'polygon') return obstacle('reserved', area.points.map(toSvg), 0)
    const c = toSvg(area.center)
    const corners = Array.from({ length: CIRCLE_CORNERS }, (_, i) => {
      const a = (2 * Math.PI * i) / CIRCLE_CORNERS
      return { x: c.x + area.radius * Math.cos(a), y: c.y + area.radius * Math.sin(a) }
    })
    return obstacle('reserved', corners, 0)
  })
}

function edgeDistance(p: Point, polygon: Point[]) {
  let best = Infinity
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    best = Math.min(best, segmentDistance(p, polygon[j], polygon[i]))
  }
  return best
}

type Interval = [number, number]
type Crossings = {
  // Length of lane over each kind of obstacle, inches.
  length: Record<Kind, number>
  // Where along the lane it's over each kind, distances along its center line.
  intervals: Record<Kind, Interval[]>
  // Lanes this one runs into: the strokes fitted alongside, by index, or
  // EXISTING for a lane that was already there.
  owners: Set<number>
}

const EXISTING = -1

/**
 * Where a lane's walls come too close to the obstacles, up to its exit, or
 * `through` that far along it, looking at every `stride`th sample of its
 * center line. Open spans have no walls, so they cross nothing.
 */
function crossings(lane: Lane, obstacles: Obstacle[], stride: number, through = lane.exitDistance): Crossings {
  const length: Record<Kind, number> = { safe: 0, lane: 0, reserved: 0 }
  const intervals: Record<Kind, Interval[]> = { safe: [], lane: [], reserved: [] }
  const current: Record<Kind, Interval | null> = { safe: null, lane: null, reserved: null }
  const owners = new Set<number>()
  const center = lane.center
  for (let i = 0; i < center.length; i += stride) {
    const q = center[i]
    if (q.s > through) break
    const hit = new Set<Kind>()
    if (!lane.open[i]) {
      const half = lane.widths[i] / 2
      for (const o of obstacles) {
        // Every lane is checked, to know whose it runs into.
        if (hit.has(o.kind) && o.kind !== 'lane') continue
        const reach = half + o.clearance
        const { left, right, top, bottom } = o.box
        if (q.p.x < left - reach || q.p.x > right + reach || q.p.y < top - reach || q.p.y > bottom + reach) continue
        if (insidePolygon(q.p, o.polygon) || edgeDistance(q.p, o.polygon) < reach) {
          hit.add(o.kind)
          if (o.kind === 'lane') owners.add(o.owner ?? EXISTING)
        }
      }
    }
    const next = center[Math.min(i + stride, center.length - 1)].s
    for (const kind of KINDS) {
      if (hit.has(kind)) {
        length[kind] += Math.min(next, through) - q.s
        if (current[kind]) current[kind]![1] = q.s
        else current[kind] = [q.s, q.s]
      } else if (current[kind]) {
        intervals[kind].push(current[kind]!)
        current[kind] = null
      }
    }
  }
  for (const kind of KINDS) if (current[kind]) intervals[kind].push(current[kind]!)
  return { length, intervals, owners }
}

/** Distance from `p` to the nearest point of a polyline. */
function polylineDistance(p: Point, line: Point[]) {
  let best = Infinity
  for (let i = 1; i < line.length; i++) best = Math.min(best, segmentDistance(p, line[i - 1], line[i]))
  return best
}

// Spacing of the center line points compared against the stroke, inches.
const FIT_SPACING = 0.25

/**
 * How closely a lane, around any horseshoe, follows a stroke: the mean
 * distance each way between them, and the stroke's furthest point from the lane.
 */
function fidelity(stroke: Point[], lane: Lane) {
  const length = lane.center[lane.center.length - 1].s
  const stride = Math.max(1, Math.round(FIT_SPACING / (length / Math.max(1, lane.center.length))))
  const line = decimate(
    lane.center.map((q) => q.p),
    stride,
  )
  let fromStroke = 0
  let worst = 0
  let worstIndex = 0
  stroke.forEach((p, i) => {
    const d = polylineDistance(p, line)
    fromStroke += d
    if (d > worst) {
      worst = d
      worstIndex = i
    }
  })
  const fromLane = line.reduce((sum, p) => sum + polylineDistance(p, stroke), 0)
  return { mean: (fromStroke / stroke.length + fromLane / line.length) / 2, worst, worstIndex }
}

// A bend point, with the stroke sample it was put at, which orders the
// bend points along the lane, and where it started, which bounds how far
// the search moves it.
type Via = Entrance & { at: number; origin: Entrance }

type Params = {
  entrance: Entrance
  exit: Exit
  entranceWeight: number
  exitWeight: number
  leadIn: number
  via: Via[]
  horseshoe: Horseshoe | null
}

type Knob = {
  get: (p: Params) => number
  set: (p: Params, v: number) => Params
  min: number
  max: number
  step: number
  precision: number
}

/** A knob for one coordinate of a point in the params, within `reach` of `origin`. */
function pointKnob(
  get: (p: Params) => Entrance,
  set: (p: Params, at: Entrance) => Params,
  axis: 'x' | 'y',
  origin: Entrance,
  reach: number,
): Knob {
  const [low, high] = axis === 'x' ? [playfield.sideRail, playfield.width - playfield.sideRail] : [0, playfield.height]
  return {
    get: (p) => get(p)[axis],
    set: (p, v) => set(p, { ...get(p), [axis]: v }),
    min: Math.max(low, origin[axis] - reach),
    max: Math.min(high, origin[axis] + reach),
    step: reach / 3,
    precision: INCH_PRECISION,
  }
}

/**
 * Knobs for every setting searched, with the ends kept within reach of
 * where they started (`initial`), and the bend points in `current` of where
 * each was put.
 */
function knobsFor(initial: Params, current: Params): Knob[] {
  const angle = initial.exit.angle
  return [
    ...(['x', 'y'] as const).map((axis) =>
      pointKnob(
        (p) => p.entrance,
        (p, entrance) => ({ ...p, entrance }),
        axis,
        initial.entrance,
        END_REACH,
      ),
    ),
    ...(['x', 'y'] as const).map((axis) =>
      pointKnob(
        (p) => p.exit,
        (p, at) => ({ ...p, exit: { ...p.exit, ...at } }),
        axis,
        initial.exit,
        END_REACH,
      ),
    ),
    {
      get: (p) => p.exit.angle,
      set: (p, v) => ({ ...p, exit: { ...p.exit, angle: v } }),
      min: angle - ANGLE_REACH,
      max: angle + ANGLE_REACH,
      step: 10,
      precision: 1,
    },
    {
      get: (p) => p.entranceWeight,
      set: (p, v) => ({ ...p, entranceWeight: v }),
      min: 0.2,
      max: 3,
      step: 0.3,
      precision: WEIGHT_PRECISION,
    },
    {
      get: (p) => p.exitWeight,
      set: (p, v) => ({ ...p, exitWeight: v }),
      min: 0.2,
      max: 3,
      step: 0.3,
      precision: WEIGHT_PRECISION,
    },
    { get: (p) => p.leadIn, set: (p, v) => ({ ...p, leadIn: v }), min: 0, max: 6, step: 1, precision: INCH_PRECISION },
    ...(initial.horseshoe ? horseshoeKnobs(initial.horseshoe) : []),
    ...current.via.flatMap((via, i) =>
      (['x', 'y'] as const).map((axis) =>
        pointKnob(
          (p) => p.via[i],
          (p, at) => ({ ...p, via: p.via.map((v, j) => (j === i ? { ...v, ...at } : v)) }),
          axis,
          via.origin,
          VIA_REACH,
        ),
      ),
    ),
  ]
}

/** Knobs for a horseshoe's turn, keeping it turning the way it started. */
function horseshoeKnobs(initial: Horseshoe): Knob[] {
  const turn = (p: Params) => p.horseshoe ?? initial
  const rotation = initial.rotation
  return [
    {
      get: (p) => turn(p).radius,
      set: (p, v) => ({ ...p, horseshoe: { ...turn(p), radius: v } }),
      min: HORSESHOE_RADIUS.min,
      max: HOOK_RADIUS + 1,
      step: 0.5,
      precision: INCH_PRECISION,
    },
    {
      get: (p) => turn(p).rotation,
      set: (p, v) => ({ ...p, horseshoe: { ...turn(p), rotation: v } }),
      min: rotation > 0 ? Math.max(HOOK_TURN - ANGLE_REACH, rotation - ANGLE_REACH) : HORSESHOE_ROTATION.min,
      max: rotation > 0 ? HORSESHOE_ROTATION.max : Math.min(ANGLE_REACH - HOOK_TURN, rotation + ANGLE_REACH),
      step: 10,
      precision: 1,
    },
  ]
}

/** Angle within ±180°. */
const wrapDegrees = (angle: number) => {
  const a = ((((angle + 180) % 360) + 360) % 360) - 180
  return a === -180 ? 180 : a
}

export type SketchedShot = Pick<
  Shot,
  'entrance' | 'exit' | 'entranceWeight' | 'exitWeight' | 'leadIn' | 'ramp' | 'end' | 'horseshoe'
> & {
  via: Entrance[]
}

// What came of one color's strokes: the shots fitted to them, none if none
// could be, and anything worth telling about them. A lane cut where it
// crosses is more than one shot, each after the first fed by the one before.
export type SketchFit = { color: number; shots: SketchedShot[]; notes: string[] }

// A stroke ready to fit, with the end the ball comes in at first.
type Prepared = {
  color: number
  points: Point[]
  length: number
  // Every path off the flippers to its entrance, which other lanes keep off.
  flights: Point[]
  // The tight turn it ends in, if any.
  hook: Hook | null
}

// A lane as fitted, and its settings.
type Part = { params: Params; lane: Lane }

// Where a fitted stroke stands while the others are fitted: its lane, or
// the pieces of it once cut, in order.
type Fitted = { index: number; parts: Part[]; ramp: boolean; notes: string[] }

// What a lane is fitted to: the stroke, or the stretch of it a piece of a
// cut lane covers (`cut`), and the settings it starts from. A piece after
// the first is fed, its ball coming through the pieces before it, the first
// of which is shot off the flippers with solutions `solved`.
type Target = {
  points: Point[]
  initial: Params
  cut: boolean
  feed: { solved: FlipperSolutions[]; feeders: Feeder[] } | null
}

/**
 * Fit a shot to each color's strokes (SVG coordinates). Runs in slices so
 * the page stays responsive, reporting lane shapes tried so far out of the
 * most it will try.
 */
export async function fitSketch(
  strokes: { color: number; points: Point[] }[],
  onProgress?: (tried: number, most: number) => void,
): Promise<SketchFit[]> {
  // Flipper solutions depend only on the entrance, so each is solved once.
  const solvedAt = new Map<string, FlipperSolutions[]>()
  const solve = (entrance: Entrance) => {
    const key = `${entrance.x},${entrance.y}`
    let solved = solvedAt.get(key)
    if (!solved) {
      solved = solveFlippers(shotDefaults(entrance))
      solvedAt.set(key, solved)
    }
    return solved
  }
  const snapPoint = (p: Point): Entrance => {
    const at = toPlayfield(p)
    return { x: snap(at.x, INCH_PRECISION), y: snap(at.y, INCH_PRECISION) }
  }

  const results: SketchFit[] = []
  const prepared: Prepared[] = []
  for (const { color, points } of strokes) {
    let even = resample(points, SPACING)
    if (strokeLength(even) < MIN_STROKE) {
      results.push({ color, shots: [], notes: ['Too short to make a lane.'] })
      continue
    }
    even = resample(smooth(smooth(even, SMOOTH_SAMPLES), SMOOTH_SAMPLES), SPACING)
    // The ball comes in at whichever end it can reach heading most nearly
    // the way the stroke sets off from there.
    const ends = [even, [...even].reverse()].flatMap((line, i) => {
      const entrance = snapPoint(line[0])
      const solved = solve(entrance)
      const aligned = alignedSolution(shotAlignment(shotDefaults(entrance)), solved)
      if (!aligned) return []
      const v = unit(aligned.solution.arrivalVelocity)
      const along = startDirection(line)
      const turn = Math.acos(clamp(v.x * along.x + v.y * along.y, -1, 1)) + (i === 0 ? 0 : REVERSE_BIAS)
      const flights = solved.flatMap((f) => Object.values(f.states).flatMap((s) => s?.flight ?? []))
      return [{ line, turn, flights, hook: findHook(line) }]
    })
    if (ends.length === 0) {
      results.push({ color, shots: [], notes: ["No flipper shot reaches either end, so there's nowhere to put the entrance."] })
      continue
    }
    // A tight turn at one end makes that end the exit: the ball can't be shot into it.
    const hooked = ends.filter((e) => e.hook)
    const best = (hooked.length > 0 ? hooked : ends).reduce((a, b) => (b.turn < a.turn ? b : a))
    prepared.push({
      color,
      points: best.line,
      length: strokeLength(best.line),
      flights: best.flights,
      hook: best.hook,
    })
  }

  // Space the ball needs clear and lanes already there, which every new lane keeps off.
  const ballRadius = ball.diameter / 2
  const fixed: Obstacle[] = [
    ...safeTravelRegions().map((region) => obstacle('safe', region, ballRadius + SAFE_MARGIN)),
    ...shotAnalyses().flatMap((a) => {
      const shot = shots.find((s) => s.id === a.id)
      return a.lane && shot && !shot.ramp ? laneObstacles(a.lane) : []
    }),
    ...reservedObstacles(),
  ]
  // The paths to each new entrance, which the other new lanes keep off.
  const flightRegions = prepared.map((p) =>
    p.flights.length > 0 ? obstacle('safe', convexHull(p.flights), ballRadius + SAFE_MARGIN) : null,
  )

  let evaluations = 0
  const most = prepared.length * STROKE_BUDGET
  let lastYield = performance.now()
  const breathe = async () => {
    if (performance.now() - lastYield < YIELD_INTERVAL) return
    // A cut lane's pieces can run over its share.
    onProgress?.(Math.min(evaluations, most), most)
    await new Promise((resolve) => setTimeout(resolve, 0))
    lastYield = performance.now()
  }

  // Longer strokes are fitted first, so shorter ones are the ones that
  // give way where lanes meet.
  const order = prepared.map((_, i) => i).sort((a, b) => prepared[b].length - prepared[a].length)
  const fitted: Fitted[] = []

  for (const [done, index] of order.entries()) {
    const stroke = prepared[index]
    const hook = stroke.hook
    // Any stroke carried on past a horseshoe's turn is left off.
    const points = hook ? stroke.points.slice(0, hook.end + 1) : stroke.points
    const obstacles = [
      ...fixed,
      ...flightRegions.flatMap((region, i) => (region && i !== index ? [region] : [])),
      ...fitted.filter((f) => !f.ramp).flatMap((f) => f.parts.flatMap((p) => laneObstacles(p.lane, f.index))),
    ]

    const shotFor = ({ horseshoe, ...params }: Params): Shot => ({
      ...shotDefaults(params.entrance),
      ...params,
      via: params.via.map((v, i) => ({ id: -1 - i, x: v.x, y: v.y, weight: 1 })),
      ...(horseshoe ? { end: 'horseshoe' as const, horseshoe } : {}),
    })
    // Lanes are first fitted as drawn, then, if `avoid`, steered off space
    // the ball needs clear and other lanes. Reserved areas are always avoided.
    const evaluate = (target: Target, params: Params, avoid: boolean) => {
      const shot = shotFor(params)
      const analysis = target.feed
        ? analyze(shot, target.feed)
        : analyze(shot, { solved: solve(shot.entrance), feeders: [] })
      const lane = analysis.lane
      if (!lane) return { cost: Infinity, lane: null }
      const fit = fidelity(target.points, lane)
      // A cut piece is checked closely, as its ends sit just clear of the
      // gaps. A horseshoe is kept clear too.
      const over = crossings(lane, obstacles, target.cut ? 1 : 3, Infinity)
      const safeCost = target.cut ? CUT_SAFE_COST : SAFE_COST
      const blocked = avoid ? safeCost * over.length.safe + LANE_COST * over.length.lane : 0
      const misses = analysis.runs.flatMap((r) => r.flippers).reduce(
        (n, f) => n + Object.values(f.states).filter((s) => s?.lane?.outcome === 'misses').length,
        0,
      )
      const cost =
        FIT_COST * fit.mean +
        WORST_COST * fit.worst +
        ROUGH_WEIGHT * roughness(shot, analysis) +
        MISS_COST * misses +
        blocked +
        RESERVED_COST * over.length.reserved
      return { cost, lane }
    }

    const descend = async (target: Target, from: Params, budget: number, avoid = false) => {
      const knobs = knobsFor(target.initial, from)
      let best = from
      let { cost: bestCost, lane: bestLane } = evaluate(target, from, avoid)
      const steps = knobs.map((k) => k.step)
      let spent = 0
      while (spent < budget && steps.some((s, i) => s >= knobs[i].step * MIN_STEP_FRACTION)) {
        let improved = false
        for (const [i, knob] of knobs.entries()) {
          if (steps[i] < knob.step * MIN_STEP_FRACTION) continue
          for (const dir of [1, -1]) {
            const value = clamp(snap(knob.get(best) + dir * steps[i], knob.precision), knob.min, knob.max)
            if (value === knob.get(best) || spent >= budget) continue
            const candidate = knob.set(best, value)
            const result = evaluate(target, candidate, avoid)
            spent++
            evaluations++
            await breathe()
            if (result.cost < bestCost) {
              best = candidate
              bestCost = result.cost
              bestLane = result.lane
              improved = true
              break
            }
          }
        }
        if (!improved) steps.forEach((s, i) => (steps[i] = s / 2))
      }
      return { params: best, cost: bestCost, lane: bestLane }
    }

    // Straight from end to end of the stroke, leaving in the direction it
    // ends in, or from the entrance to where a horseshoe's turn starts.
    const exitAt = hook ? hook.start : points.length - 1
    const end = startDirection(points.slice(0, exitAt + 1).reverse())
    const initial: Params = {
      entrance: snapPoint(points[0]),
      exit: {
        ...snapPoint(points[exitAt]),
        // Backward along the stroke from its end; on screen y is flipped.
        angle: Math.round((Math.atan2(end.y, -end.x) * 180) / Math.PI),
      },
      entranceWeight: 1,
      exitWeight: 1,
      leadIn: 0,
      via: [],
      horseshoe: hook && { ...hook.horseshoe },
    }
    const whole: Target = { points, initial, cut: false, feed: null }
    let best = await descend(whole, initial, STAGE_BUDGET)
    if (!best.lane) {
      results.push({ color: stroke.color, shots: [], notes: ["Couldn't shape a lane along this stroke."] })
      evaluations = (done + 1) * STROKE_BUDGET
      continue
    }

    // Bend points go where the stroke strays furthest from the lane, one at a time.
    const clearance = Math.round(VIA_END_CLEARANCE / SPACING)
    while (best.params.via.length < MAX_VIA) {
      const fit = fidelity(points, best.lane!)
      const at = fit.worstIndex
      // Not in a horseshoe's turn: the horseshoe makes that.
      if (fit.worst < VIA_TOLERANCE || at < clearance || at > exitAt - clearance) break
      if (best.params.via.some((v) => Math.abs(v.at - at) < clearance)) break
      const origin = snapPoint(points[at])
      const via = [...best.params.via, { ...origin, at, origin }].sort((a, b) => a.at - b.at)
      const next = await descend(whole, { ...best.params, via }, STAGE_BUDGET)
      if (!next.lane || next.cost > best.cost - VIA_GAIN) break
      best = next
    }


    /**
     * The pieces of a lane left between `gaps` (fractions of the distance to
     * its exit), each fitted again to its own stretch of the stroke. The
     * first is shot off the flippers; each after it is fitted to catch the
     * ball coming out of the one before. Null if a piece can't be made.
     */
    const cutLane = async (params: Params, lane: Lane, gaps: Span[]): Promise<Part[] | null> => {
      const length = lane.exitDistance
      const kept: Interval[] = []
      let from = 0
      for (const gap of gaps) {
        if (gap.from * length > from) kept.push([from, gap.from * length])
        from = gap.to * length
      }
      if (from < length) kept.push([from, length])

      const cut: Part[] = []
      for (const [a, b] of kept) {
        const start = sampleAt(lane, a)
        const end = sampleAt(lane, b)
        const first = nearestIndex(points, start.p)
        const last = nearestIndex(points, end.p)
        if (last - first < 2) return null
        // Ends that weren't cut stay as they were fitted.
        const atEntrance = a === 0
        const atExit = b === length
        // A fed piece starts where the ball's headed: as far across from the
        // exit before it as drawn, but out along that exit's direction.
        const before = cut.at(-1)?.params.exit
        const across = before && dist(before, toPlayfield(start.p))
        const angle = before && (before.angle * Math.PI) / 180
        const initial: Params = {
          entrance: atEntrance
            ? params.entrance
            : before
              ? {
                  x: snap(before.x + across! * Math.cos(angle!), INCH_PRECISION),
                  y: snap(before.y + across! * Math.sin(angle!), INCH_PRECISION),
                }
              : snapPoint(start.p),
          exit: atExit
            ? params.exit
            : // On screen y is flipped.
              { ...snapPoint(end.p), angle: Math.round((Math.atan2(-end.t.y, end.t.x) * 180) / Math.PI) },
          entranceWeight: atEntrance ? params.entranceWeight : 1,
          exitWeight: atExit ? params.exitWeight : 1,
          leadIn: atEntrance ? params.leadIn : 0,
          via: params.via.filter((v) => v.at > first + clearance && v.at < last - clearance),
          horseshoe: atExit ? params.horseshoe : null,
        }
        const feed =
          cut.length === 0
            ? null
            : {
                solved: solve(cut[0].params.entrance),
                feeders: cut.map((p, i) => ({ id: -1 - i, exit: p.params.exit, lane: p.lane })),
              }
        // The last piece takes the horseshoe's turn with it.
        const target = { points: points.slice(first, atExit ? points.length : last + 1), initial, cut: true, feed }
        const piece = await descend(target, initial, REFINE_BUDGET, true)
        if (!piece.lane) return null
        cut.push({ params: piece.params, lane: piece.lane })
      }
      return cut
    }

    const notes: string[] = hook ? ['Ends in a horseshoe, where the stroke turns tightly back.'] : []
    let params = best.params
    let lane = best.lane!
    let ramp = false
    let cut: Part[] | null = null

    let over = crossings(lane, obstacles, 1)
    if (over.intervals.safe.length > 0 || over.intervals.lane.length > 0) {
      // In the way of something: steer clear if that keeps it near enough
      // to the sketch. Otherwise it's resolved as drawn.
      const avoided = await descend(whole, params, AVOID_BUDGET, true)
      if (avoided.lane) {
        const clear = crossings(avoided.lane, obstacles, 1)
        const fit = fidelity(points, avoided.lane)
        if (
          clear.intervals.safe.length === 0 &&
          clear.intervals.lane.length === 0 &&
          fit.mean <= AVOID_MEAN &&
          fit.worst <= AVOID_WORST
        ) {
          params = avoided.params
          lane = avoided.lane
          over = clear
        }
      }
    }
    let reserved = crossings(lane, obstacles, 1, Infinity).length.reserved > 0
    const longest = (list: Interval[]) => Math.max(0, ...list.map(([a, b]) => b - a))
    if (over.intervals.lane.length > 0) {
      // Another lane's in the way: whichever is shorter goes over the other.
      // Lanes already there stay as they are, and so do lanes that were
      // cut, whose gaps a ramp would have to cross.
      const others = [...over.owners].flatMap((owner) => fitted.filter((f) => f.index === owner))
      const givesWay = (f: Fitted) => f.parts.length === 1 && f.parts[0].lane.exitDistance < lane.exitDistance
      if (!over.owners.has(EXISTING) && others.every(givesWay)) {
        for (const f of others) {
          f.ramp = true
          f.notes.push('Made a ramp, to cross over a longer lane.')
        }
      } else {
        ramp = true
        notes.push('Made a ramp, to cross over another lane.')
      }
    }
    // Crossings close together are one long crossing.
    const safe = mergeIntervals(over.intervals.safe, SPAN_MERGE)
    if (!ramp && safe.length > 0) {
      const short = longest(safe) <= RAMP_SPAN
      const gaps = short ? null : gapsFor(safe, lane.exitDistance)
      cut = gaps && (await cutLane(params, lane, gaps))
      if (!cut) {
        ramp = true
        notes.push(
          short
            ? 'Made a ramp, to pass over space the ball needs clear to reach another shot.'
            : !gaps
              ? 'Made a ramp: it runs over space the ball needs clear to reach another shot for most of its length.'
              : "Made a ramp: it crosses space the ball needs clear to reach another shot, and couldn't be cut there.",
        )
      } else {
        notes.push(
          cut.length === 1
            ? 'Cut short where it crosses space the ball needs clear to reach another shot.'
            : `Cut into ${cut.length} shots where it crosses space the ball needs clear to reach another shot. The ball leaves each one and crosses open playfield into the next.`,
        )
        // Each piece moved a little when fitted again.
        const still = cut.map((p) => crossings(p.lane, obstacles, 1, Infinity))
        if (still.some((c) => c.intervals.safe.length > 0)) notes.push('Still crosses some space the ball needs clear.')
        reserved = still.some((c) => c.length.reserved > 0)
      }
    }
    if (reserved) notes.push('Still runs into a custom mech.')

    fitted.push({ index, parts: cut ?? [{ params, lane }], ramp, notes })
    evaluations = (done + 1) * STROKE_BUDGET
    onProgress?.(evaluations, most)
  }

  for (const f of fitted) {
    results.push({
      color: prepared[f.index].color,
      shots: f.parts.map(({ params }) => ({
        entrance: params.entrance,
        exit: { ...params.exit, angle: wrapDegrees(params.exit.angle) },
        entranceWeight: params.entranceWeight,
        exitWeight: params.exitWeight,
        leadIn: params.leadIn,
        via: params.via.map(({ x, y }) => ({ x, y })),
        ramp: f.ramp,
        end: params.horseshoe ? 'horseshoe' : 'open',
        horseshoe: params.horseshoe ?? { ...DEFAULT_HORSESHOE },
      })),
      notes: f.notes,
    })
  }
  return results.sort((a, b) => a.color - b.color)
}

/** The sample of a lane's center line nearest `s` along it. */
const sampleAt = (lane: Lane, s: number) =>
  lane.center.reduce((best, q) => (Math.abs(q.s - s) < Math.abs(best.s - s) ? q : best))

/** Index of the point in `points` nearest `p`. */
const nearestIndex = (points: Point[], p: Point) =>
  points.reduce((best, q, i) => (dist(q, p) < dist(points[best], p) ? i : best), 0)

/** Stretches in order, with any closer together than `gap` made one. */
function mergeIntervals(intervals: Interval[], gap: number): Interval[] {
  const out: Interval[] = []
  for (const [a, b] of [...intervals].sort((x, y) => x[0] - y[0])) {
    const last = out[out.length - 1]
    if (last && a <= last[1] + gap) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out
}

// Where a lane is cut, as fractions of the distance to its exit.
type Span = { from: number; to: number }

/**
 * Gaps to cut in a lane over stretches of it (distances along it), padded
 * either side, as fractions of the distance to the exit. Pieces of lane too
 * short to be worth building are cut out too. Null if that leaves too
 * little lane to guide the ball.
 */
function gapsFor(intervals: Interval[], exitDistance: number): Span[] | null {
  const spans = mergeSpans(
    intervals.map(([a, b]) => ({
      from: clamp((a - SPAN_PAD) / exitDistance, 0, 1),
      to: clamp((b + SPAN_PAD) / exitDistance, 0, 1),
    })),
    MIN_PIECE / exitDistance,
  )
  const first = spans[0]
  const last = spans[spans.length - 1]
  if (first && first.from * exitDistance < MIN_PIECE) first.from = 0
  if (last && (1 - last.to) * exitDistance < MIN_PIECE) last.to = 1
  const walled = exitDistance * (1 - spans.reduce((sum, s) => sum + s.to - s.from, 0))
  return walled < Math.max(MIN_WALLED, exitDistance * MIN_WALLED_FRACTION) ? null : spans
}

/** Spans in order, with any that overlap or come within `gap` of each other made one. */
function mergeSpans(spans: Span[], gap = 0): Span[] {
  const sorted = [...spans].sort((a, b) => a.from - b.from)
  const out: Span[] = []
  for (const span of sorted) {
    const last = out[out.length - 1]
    if (last && span.from <= last.to + gap) last.to = Math.max(last.to, span.to)
    else out.push({ ...span })
  }
  return out.map((s) => ({ from: snap(s.from, 0.001), to: snap(s.to, 0.001) }))
}
