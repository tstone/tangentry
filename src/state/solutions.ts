import { createMemo, createRoot, mapArray } from 'solid-js'
import { playfield } from './playfield'
import { flipperShape, flippers, profile, restAngle, torque, type FlipperShape } from './flippers'
import { extraFlipperKey, extraFlippers, type ExtraFlipper } from './extraFlippers'
import { ballMass, flipperInertia, flipperProfile, type FlipperProfile } from '../physics/drive'
import { inlanes } from './inlanes'
import { ball } from './ball'
import { walls } from './walls'
import {
  feedChain,
  selectedId,
  shots,
  type Entrance,
  type BallState,
  type Exit,
  type FlipperKey,
  type LaneAlignment,
  type Shot,
  type WallSide,
} from './shots'
import {
  flexPerSpeed,
  flexRestitution,
  wallStiffness,
  type Mount,
  type MountKind,
  type WallSpec,
} from '../physics/wall'
import { INLANE_LENGTH, computeLayout, extraFlipperLayout, toRadians, type Side } from './layout'
import { GRAVITY, rollingGravity, rollingSpeed, solveShot, type Departure, type FlipperSpec } from '../physics/shot'
import type { Point } from '../geometry/flipper'
import { polygonsOverlap } from '../geometry/overlap'
import {
  appendTurn,
  runLane,
  laneCenterLine,
  laneWidths,
  normal,
  offsetCurve,
  tightestBend,
  unit,
  type CurveSample,
  type LaneOutcome,
  type LaneRun,
  type WallContact,
} from '../geometry/lane'

export type { BallState }

export const BALL_STATES: { state: BallState; label: string }[] = [
  { state: 'inlane', label: 'Down the inlane' },
  { state: 'cradle', label: 'From a cradle' },
]

// Cross-field shots come off the far flipper; backhands off the near one.
export type Approach = 'cross' | 'backhand'

export const APPROACHES: { approach: Approach; label: string }[] = [
  { approach: 'cross', label: 'Cross-field' },
  { approach: 'backhand', label: 'Backhand' },
]

export const OUTCOME_LABELS: Record<LaneOutcome, string> = {
  smooth: 'smooth',
  chatter: 'chatters along the wall',
  ricochet: 'ricochets off the wall',
  rattle: 'rattles',
  stalls: 'stalls in the lane',
  misses: 'misses the walls past an open span',
}

/** A solved shot, in SVG coordinates. */
export type Solution = {
  fireDistance: number
  // Seconds from the ball reaching the flipper base (or being released
  // from the cradle) until the flipper fires.
  fireTime: number
  fireBall: Point
  ride: Point[]
  rideSpeeds: number[]
  // Flipper center-line direction at departure, radians in SVG coordinates.
  flipperAngle: number
  departure: Point
  // Direction of travel at departure, degrees counter-clockwise from the
  // playfield's +x axis as seen on screen (90° is straight up the playfield).
  departureAngle: number
  speed: number
  departureKind: Departure
  flight: Point[]
  flightSpeeds: number[]
  flightTime: number
  // Ball center and velocity (in/s) where the flight passes the entrance.
  arrival: Point
  arrivalVelocity: Point
  // The ball's trip through the lane; null without a lane or if the ball
  // doesn't fit.
  lane: LaneRun | null
}

export type FlipperSolutions = {
  key: FlipperKey
  // Heading for this flipper's results.
  label: string
  // For the main pair, whether it's across from the entrance; null for an
  // extra flipper.
  approach: Approach | null
  side: Side
  pivot: Point
  shape: FlipperShape
  // Only the ways the ball can arrive on this flipper: an extra flipper's
  // ball only rolls in, along its axis.
  states: Partial<Record<BallState, Solution | null>>
}

export type FlipperSolver = ReturnType<typeof solverFor>

/**
 * Solves shots off one flipper: how to fire it so the ball rolls through a
 * point, given as an entrance is (up from the bottom lip). `restAngle` is
 * in degrees; `baseSpeeds` are the ways the ball can arrive on it, with its
 * speed along the flipper as it reaches the base.
 */
function solverFor(
  side: Side,
  pivot: Point,
  stock: FlipperProfile,
  restAngle: number,
  baseSpeeds: Partial<Record<BallState, number>>,
) {
  const states = BALL_STATES.map((s) => s.state).filter((state) => state in baseSpeeds)
  const slope = GRAVITY * Math.sin(toRadians(playfield.angle))
  const ballRadius = ball.diameter / 2
  const shape = flipperShape(stock)
  const spec: FlipperSpec = {
    ...shape,
    restAngle: toRadians(restAngle),
    stroke: toRadians(flippers.strokeAngle),
    torque: torque(),
    inertia: flipperInertia(stock),
    friction: flippers.friction,
  }
  // The physics works in a left flipper's frame: pivot at the origin, x
  // toward the center line, y up the playfield. Right flippers are mirrored.
  const sx = side === 'left' ? 1 : -1
  const toSvg = (p: Point): Point => ({ x: pivot.x + sx * p.x, y: pivot.y - p.y })

  // Side rails, inset so the ball's edge (not its center) touches them.
  const walls = [
    sx * (playfield.sideRail + ballRadius - pivot.x),
    sx * (playfield.width - playfield.sideRail - ballRadius - pivot.x),
  ]
  const bounds = { minX: Math.min(...walls), maxX: Math.max(...walls), maxY: pivot.y - ballRadius }

  const solve = (to: Entrance, state: BallState): Solution | null => {
    const target = { x: sx * (to.x - pivot.x), y: pivot.y - (playfield.height - to.y) }
    const s = solveShot({ flipper: spec, ballRadius, ballMass: ballMass(ball.diameter), slope, baseSpeed: baseSpeeds[state] ?? 0, target, bounds })
    if (!s) return null
    const angle = (Math.atan2(s.velocity.y, sx * s.velocity.x) * 180) / Math.PI
    return {
      fireDistance: s.fireDistance,
      fireTime: s.fireTime,
      fireBall: toSvg(s.fireBall),
      ride: s.ride.map(toSvg),
      rideSpeeds: s.rideSpeeds,
      flipperAngle: side === 'left' ? -s.flipperAngle : Math.PI + s.flipperAngle,
      departure: toSvg(s.departure),
      departureAngle: angle,
      speed: s.speed,
      departureKind: s.departureKind,
      flight: s.flight.map(toSvg),
      flightSpeeds: s.flightSpeeds,
      flightTime: s.flightTime,
      arrival: toSvg(s.flight[s.flight.length - 1]),
      arrivalVelocity: { x: sx * s.arrivalVelocity.x, y: -s.arrivalVelocity.y },
      lane: null,
    }
  }

  return { side, pivot, shape, states, solve }
}

/** Solves shots off one of the main pair of flippers. */
export function flipperSolver(side: Side) {
  const { pivot } = computeLayout().flippers[side === 'left' ? 0 : 1]
  const slope = GRAVITY * Math.sin(toRadians(playfield.angle))
  return solverFor(side, pivot, profile(), restAngle(), {
    inlane: rollingSpeed(ball.inlaneSpeed, slope, toRadians(inlanes.angle), INLANE_LENGTH),
    // Released from a standstill.
    cradle: 0,
  })
}

/**
 * Solves shots off an extra flipper. The ball rolls onto it along its axis,
 * reaching the base at the flipper's own entrance speed.
 */
export function extraFlipperSolver(f: ExtraFlipper) {
  return solverFor(f.side, extraFlipperLayout(f).pivot, flipperProfile(f.profile), f.restAngle, {
    inlane: f.entranceSpeed,
  })
}

/** How the ball arrives on a flipper, for display: extra flippers have no inlane. */
export const stateLabel = (key: FlipperKey, state: BallState) =>
  key.startsWith('extra') && state === 'inlane' ? 'Rolling in' : BALL_STATES.find((s) => s.state === state)!.label

/** A solver for every flipper on the playfield: the main pair, then the extras. */
export const allFlipperSolvers = (): FlipperSolver[] => [
  flipperSolver('left'),
  flipperSolver('right'),
  ...extraFlippers.map(extraFlipperSolver),
]

function solveWith(
  solver: FlipperSolver,
  key: FlipperKey,
  label: string,
  approach: Approach | null,
  to: Entrance,
): FlipperSolutions {
  const { side, pivot, shape } = solver
  const states = Object.fromEntries(solver.states.map((state) => [state, solver.solve(to, state)]))
  return { key, label, approach, side, pivot, shape, states }
}

/** The main flipper a cross-field shot to `entrance` comes off: entrances left of center cross from the right. */
export const crossSide = (entrance: Entrance): Side => (entrance.x < flippers.centerLine ? 'right' : 'left')

/** The flipper a shot is made off, with 'auto' resolved. */
export const targetFlipper = (shot: Shot): FlipperKey => (shot.flipper === 'auto' ? crossSide(shot.entrance) : shot.flipper)

/** The ball path a shot's lane is meant to line up with. An extra flipper's ball only rolls in. */
export const shotAlignment = (shot: Shot): LaneAlignment => {
  const key = targetFlipper(shot)
  return `${key}-${key.startsWith('extra') ? 'inlane' : shot.ballState}`
}

/** Every flipper's shots through a shot's entrance: the main pair's, cross-field first, then each extra flipper's. */
export function solveFlippers(shot: Shot): FlipperSolutions[] {
  const cross = crossSide(shot.entrance)

  const main = APPROACHES.map(({ approach, label }) => {
    const side: Side = approach === 'cross' ? cross : cross === 'left' ? 'right' : 'left'
    return solveWith(flipperSolver(side), side, `${label} · ${side} flipper`, approach, shot.entrance)
  })
  const extra = extraFlippers.map((f) =>
    solveWith(extraFlipperSolver(f), extraFlipperKey(f.id), f.name, null, shot.entrance),
  )
  return [...main, ...extra]
}

// Which wall each `offsetCurve` side is: 1 is to the right of travel.
export const WALL_SIDES: { side: WallSide; offset: number; label: string }[] = [
  { side: 'left', offset: -1, label: 'Left wall' },
  { side: 'right', offset: 1, label: 'Right wall' },
]

export type LaneWall = {
  side: WallSide
  points: Point[]
  // Distance along the wall at each point, inches.
  lengths: number[]
  // Fraction of the speed into the wall the ball bounces back with at each point.
  restitution: number[]
  // How far the wall flexes at each point per in/s of speed into it, inches.
  flexPerSpeed: number[]
  // Mounts where they sit on the wall, with the direction away from the lane.
  mounts: { id: number; kind: MountKind; point: Point; outward: Point }[]
}

export type Lane = {
  center: CurveSample[]
  // Distance along the center line to the exit. The center line runs on
  // past it around a horseshoe.
  exitDistance: number
  // Wall-to-wall width at each sample of the center line.
  widths: number[]
  // Samples of the center line along an open span, with no walls beside them.
  open: boolean[]
  // First and last sample of each stretch that has walls.
  pieces: Piece[]
  walls: LaneWall[]
  // Solution the entrance is lined up with. Differs from the shot's
  // alignment when that one has no solution. Null for a fed lane, which
  // lines up with the exit feeding it.
  alignedTo: LaneAlignment | null
  // The ball is wider than the lane.
  tooNarrow: boolean
  // Furthest a wall runs past a side rail, inches; 0 if the lane fits.
  overRail: number
  // Tightest radius of the center line and its distance along it.
  tightest: { radius: number; distance: number }
}

export type ShotAnalysis = {
  id: number
  flippers: FlipperSolutions[]
  lane: Lane | null
  // Each lane the ball paths run through, in order: any feeding this one,
  // its own, and any joined on at the exit. Empty if they weren't run.
  parts: TrackPart[]
}

// A shot's lane as a stretch of the samples a ball path runs along: samples
// `first` to `last` are the lane's own from `from` on, or back from it when
// `backward`, as through a joined lane.
export type TrackPart = { id: number; first: number; last: number; from: number; backward: boolean }

const solutionFor = (flippers: FlipperSolutions[], alignment: LaneAlignment) => {
  const [key, state] = alignment.split('-') as [FlipperKey, BallState]
  return flippers.find((f) => f.key === key)?.states[state] ?? null
}

/**
 * The solved ball path a lane's entrance lines up with: the chosen one, or
 * failing that another off the same flipper, or the first that exists, the
 * main pair's before the extra flippers'. Null if none reaches the entrance.
 */
export function alignedSolution(alignment: LaneAlignment, solved: FlipperSolutions[]) {
  const order = solved.flatMap((f) =>
    BALL_STATES.filter(({ state }) => state in f.states).map(({ state }): LaneAlignment => `${f.key}-${state}`),
  )
  const sameFlipper = alignment.slice(0, alignment.lastIndexOf('-') + 1)
  const alignedTo = [alignment, ...order.filter((a) => a.startsWith(sameFlipper)), ...order].find((a) =>
    solutionFor(solved, a),
  )
  return alignedTo ? { alignedTo, solution: solutionFor(solved, alignedTo)! } : null
}

const scaleNormal = (t: Point, side: number): Point => ({ x: normal(t).x * side, y: normal(t).y * side })

// First and last sample index of a stretch of wall.
export type Piece = [number, number]

/** The stretches between open samples, each at least two samples long. */
export function walledPieces(open: boolean[]): Piece[] {
  const pieces: Piece[] = []
  let start = -1
  open.forEach((isOpen, i) => {
    if (!isOpen && start < 0) start = i
    if (start >= 0 && (isOpen || i === open.length - 1)) {
      const end = isOpen ? i - 1 : i
      if (end > start) pieces.push([start, end])
      start = -1
    }
  })
  return pieces
}

/**
 * Stiffness at each point of a wall made of separate pieces, each held only
 * by the mounts on it. Points between pieces have no wall, so nothing flexes.
 */
export function piecewiseStiffness(points: Point[], mounts: Mount[], pieces: Piece[], spec: WallSpec): number[] {
  const stiffness = points.map(() => Infinity)
  for (const [first, last] of pieces) {
    const own = mounts.filter((m) => m.index >= first && m.index <= last).map((m) => ({ ...m, index: m.index - first }))
    wallStiffness(points.slice(first, last + 1), own, spec).forEach((k, i) => (stiffness[first + i] = k))
  }
  return stiffness
}

/** Where an exit is and the way it points, in SVG coordinates. */
export const exitSample = (exit: Exit): CurveSample => {
  const angle = toRadians(exit.angle)
  // Screen angles are counter-clockwise; SVG y points down.
  return { p: { x: exit.x, y: playfield.height - exit.y }, t: { x: Math.cos(angle), y: -Math.sin(angle) }, s: 0 }
}

/** Last sample of a lane's center line up to its exit, and its index. */
export function laneExit(lane: Lane) {
  let index = lane.center.length - 1
  while (index > 0 && lane.center[index].s > lane.exitDistance) index--
  return { index, sample: lane.center[index] }
}

/**
 * A shot's lane, lined up with one of its solved ball paths; null if none
 * reaches the entrance. A fed lane instead starts out heading straight from
 * `from`, the exit feeding it.
 */
export function shapeLane(shot: Shot, solved: FlipperSolutions[], from: CurveSample | null = null): Lane | null {
  const aligned = from ? null : alignedSolution(shotAlignment(shot), solved)
  if (!from && !aligned) return null
  const entrance = { x: shot.entrance.x, y: playfield.height - shot.entrance.y }
  const exit = { x: shot.exit.x, y: playfield.height - shot.exit.y }
  const exitAngle = toRadians(shot.exit.angle)
  // A fed lane points the way the ball comes across from the exit feeding
  // it, or the way that exit points if it's right there.
  const across = from && { x: entrance.x - from.p.x, y: entrance.y - from.p.y }
  const startDir = !across
    ? unit(aligned!.solution.arrivalVelocity)
    : Math.hypot(across.x, across.y) > 1e-6
      ? unit(across)
      : from!.t
  // The lane can sit off to one side of where the ball enters.
  const start = {
    x: entrance.x - normal(startDir).x * shot.entranceOffset,
    y: entrance.y - normal(startDir).y * shot.entranceOffset,
  }
  const horseshoe = shot.end === 'horseshoe' && shot.link === null
  const turn = toRadians(shot.horseshoe.rotation)
  const toExit = laneCenterLine(
    start,
    startDir,
    exit,
    // Screen angles are counter-clockwise; SVG y points down.
    { x: Math.cos(exitAngle), y: -Math.sin(exitAngle) },
    shot.continuity,
    { entrance: shot.entranceWeight, exit: shot.exitWeight },
    shot.leadIn,
    shot.via.map((v) => ({ x: v.x, y: playfield.height - v.y })),
  )
  const exitDistance = toExit[toExit.length - 1].s
  // A horseshoe carries the lane on past the exit, at the exit width.
  const center = horseshoe ? appendTurn(toExit, shot.horseshoe.radius, turn) : toExit
  const width = {
    entrance: shot.entranceWidth,
    exit: shot.exitWidth,
    funnelLength: shot.funnelLength,
    length: exitDistance,
  }
  const mass = ballMass(ball.diameter)
  // Open spans only reach as far as the exit, not around a horseshoe.
  const open = center.map(
    (q) =>
      q.s <= exitDistance &&
      shot.openSpans.some((span) => q.s >= span.from * exitDistance && q.s <= span.to * exitDistance),
  )
  const pieces = walledPieces(open)

  const laneWalls: LaneWall[] = WALL_SIDES.map(({ side, offset }) => {
    const points = offsetCurve(center, offset, width)
    let length = 0
    const lengths = points.map((p, i) => (length += i > 0 ? Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) : 0))
    // Each mount goes on the wall point nearest its distance along the wall.
    const placed = shot.mounts[side].map((m) => {
      const target = m.at * length
      let index = 0
      for (let i = 1; i < lengths.length; i++) {
        if (Math.abs(lengths[i] - target) < Math.abs(lengths[index] - target)) index = i
      }
      return { ...m, index }
    })
    const stiffness = piecewiseStiffness(points, placed, pieces, walls)
    return {
      side,
      points,
      lengths,
      restitution: stiffness.map((k) => walls.restitution * flexRestitution(k, mass)),
      flexPerSpeed: stiffness.map((k) => flexPerSpeed(k, mass)),
      mounts: placed.map((m) => ({
        id: m.id,
        kind: m.kind,
        point: points[m.index],
        outward: scaleNormal(center[m.index].t, offset),
      })),
    }
  })
  return {
    center,
    exitDistance,
    widths: laneWidths(center, width),
    open,
    pieces,
    walls: laneWalls,
    alignedTo: aligned?.alignedTo ?? null,
    tooNarrow: Math.min(width.entrance, width.exit) <= ball.diameter,
    overRail: Math.max(
      0,
      ...laneWalls.flatMap((w) =>
        w.points.map((p) => Math.max(playfield.sideRail - p.x, p.x - (playfield.width - playfield.sideRail))),
      ),
    ),
    tightest: tightestBend(center),
  }
}

/**
 * Closed outlines of the space a lane takes up, one for each stretch with
 * walls: along one wall and back down the other.
 */
export const laneOutlines = (lane: Lane) =>
  lane.pieces.map(([first, last]) => [
    ...lane.walls[0].points.slice(first, last + 1),
    ...lane.walls[1].points.slice(first, last + 1).reverse(),
  ])

const wallOn = (lane: Lane, offset: number) => lane.walls[WALL_SIDES.findIndex((w) => w.offset === offset)]

// A shot whose exit leads into the next lane the ball runs through, and
// that shot's lane, null if it has none.
export type Feeder = { id: number; exit: Exit; lane: Lane | null }

// Spacing of the samples across open playfield, from a lane's exit to the
// entrance of the lane it feeds, inches.
const GAP_SPACING = 0.05

type Placed = TrackPart & { lane: Lane }

/**
 * What the ball runs along: the lanes feeding a shot's, each up to its exit
 * and then straight across open playfield to the next one's entrance; the
 * shot's own lane; then on through the lane joined to its exit, backward
 * from there to that lane's entrance. Going backward swaps the joined
 * lane's walls, since its right is then on the ball's left.
 */
function track(id: number, own: Lane, feeders: { id: number; lane: Lane }[], joined: { id: number; lane: Lane } | null) {
  const center: CurveSample[] = []
  const widths: number[] = []
  const open: boolean[] = []
  const placed: Placed[] = []

  const push = (p: Point, t: Point, width: number, isOpen: boolean) => {
    const last = center.at(-1)
    center.push({ p, t, s: last ? last.s + Math.hypot(p.x - last.p.x, p.y - last.p.y) : 0 })
    widths.push(width)
    open.push(isOpen)
  }
  // Samples of a lane, in the order given.
  const addLane = (id: number, lane: Lane, indices: number[], backward: boolean) => {
    // A lane starting where the track left off, as joined exits do, shares that point.
    const last = center.at(-1)
    const start = lane.center[indices[0]].p
    const skip = last && Math.hypot(start.x - last.p.x, start.y - last.p.y) < 1e-9 ? 1 : 0
    const first = center.length
    for (const i of indices.slice(skip)) {
      const { p, t } = lane.center[i]
      push(p, backward ? { x: -t.x, y: -t.y } : t, lane.widths[i], lane.open[i])
    }
    if (center.length > first) placed.push({ id, lane, first, last: center.length - 1, from: indices[skip], backward })
  }
  // Open playfield in a straight line on to the start of `lane`.
  const crossTo = (lane: Lane) => {
    const a = center.at(-1)!
    const b = lane.center[0].p
    const length = Math.hypot(b.x - a.p.x, b.y - a.p.y)
    const n = Math.floor(length / GAP_SPACING)
    const t = unit({ x: b.x - a.p.x, y: b.y - a.p.y })
    const from = widths.at(-1)!
    for (let k = 1; k < n; k++) {
      const f = k / n
      push({ x: a.p.x + (b.x - a.p.x) * f, y: a.p.y + (b.y - a.p.y) * f }, t, from + (lane.widths[0] - from) * f, true)
    }
  }
  const upTo = (count: number) => Array.from({ length: count }, (_, i) => i)

  for (const feeder of feeders) {
    if (center.length > 0) crossTo(feeder.lane)
    addLane(feeder.id, feeder.lane, upTo(laneExit(feeder.lane).index + 1), false)
  }
  if (center.length > 0) crossTo(own)
  addLane(id, own, upTo(own.center.length), false)
  if (joined) addLane(joined.id, joined.lane, upTo(joined.lane.center.length).reverse(), true)

  return {
    center,
    widths,
    open,
    parts: placed.map(({ lane: _, ...part }): TrackPart => part),
    response: (offset: number, index: number) => {
      const part = placed.find((p) => index >= p.first && index <= p.last)
      // Every walled sample is part of a lane; this is only to be safe.
      if (!part) return { restitution: walls.restitution, flexPerSpeed: 0 }
      const wall = wallOn(part.lane, part.backward ? -offset : offset)
      const i = laneIndex(part, index)
      return { restitution: wall.restitution[i], flexPerSpeed: wall.flexPerSpeed[i] }
    },
  }
}

const laneIndex = (part: TrackPart, index: number) =>
  part.backward ? part.from - (index - part.first) : part.from + (index - part.first)

/**
 * Which wall a ball path in a shot's analysis touched: whose lane, which
 * side (as `offsetCurve` numbers them) and which sample along it. Null off
 * every lane, as across open playfield between them.
 */
export function contactWall(analysis: ShotAnalysis, contact: WallContact) {
  const part = analysis.parts.find((p) => contact.index >= p.first && contact.index <= p.last)
  if (!part) return null
  return { id: part.id, offset: part.backward ? -contact.side : contact.side, index: laneIndex(part, contact.index) }
}

/**
 * Run each of a shot's solved ball paths through its lane, after the lanes
 * feeding it and on through the lane joined to its exit if there is one. A
 * fed shot's ball paths are those of the first feeding lane, off the flippers.
 */
function runLanes(
  shot: Shot,
  solved: FlipperSolutions[],
  lane: Lane | null,
  joined: Lane | null,
  feeders: Feeder[] = [],
): ShotAnalysis {
  // Without every lane feeding it, there's no knowing how the ball gets here.
  const feeding = feeders.flatMap((f) => (f.lane ? [{ id: f.id, lane: f.lane }] : []))
  if (!lane || feeding.length < feeders.length) return { id: shot.id, flippers: solved, lane, parts: [] }
  const { center, widths, open, parts, response } = track(
    shot.id,
    lane,
    feeding,
    joined && shot.link !== null ? { id: shot.link, lane: joined } : null,
  )
  const ballRadius = ball.diameter / 2
  const gravity = rollingGravity(GRAVITY * Math.sin(toRadians(playfield.angle)))

  const flippers = solved.map((f) => ({
    ...f,
    states: Object.fromEntries(
      Object.entries(f.states).map(([state, s]) => [
        state,
        s && {
          ...s,
          lane: runLane(center, widths, ballRadius, s.arrival, s.arrivalVelocity, gravity, response, open),
        },
      ]),
    ) as FlipperSolutions['states'],
  }))

  return { id: shot.id, flippers, lane, parts }
}

/**
 * Solve a shot's flippers and run each ball path through its lane, and on
 * through `joined`, the lane of the shot linked to it. The flipper
 * solutions depend only on the entrance, so callers trying many lane shapes
 * for one entrance can solve them once and pass them in.
 *
 * A fed shot's ball comes through `feeders` first, from the one shot off
 * the flippers on, and `solved` are the solutions for that one's entrance.
 */
export function analyze(
  shot: Shot,
  solved = solveFlippers(shot),
  joined: Lane | null = null,
  feeders: Feeder[] = [],
): ShotAnalysis {
  const from = feeders.at(-1)
  return runLanes(shot, solved, shapeLane(shot, solved, from ? exitSample(from.exit) : null), joined, feeders)
}

// Each shot's lane is shaped separately, so editing one doesn't re-solve
// the rest. Its ball paths are run once its own and any joined or feeding
// lanes are.
const laneShapes = createRoot(() => {
  const list = mapArray(
    () => shots,
    (shot) => {
      // A fed lane is shaped from the exit feeding it, not the flippers.
      const feeder = createMemo(() => feedChain(shot).at(-1) ?? null)
      const solved = createMemo(() => (feeder() ? [] : solveFlippers(shot)))
      const lane = createMemo(() => {
        const from = feeder()
        return shapeLane(shot, solved(), from && exitSample(from.exit))
      })
      return { id: shot.id, solved, lane }
    },
  )
  return createMemo(list)
})

/**
 * The flipper solutions a fed shot's ball paths start from, and the lanes
 * feeding it, as currently shaped. Null if it's shot off the flippers.
 */
export function shotFeed(shot: Shot): { solved: FlipperSolutions[]; feeders: Feeder[] } | null {
  const chain = feedChain(shot)
  if (chain.length === 0) return null
  const shapes = laneShapes()
  const shapeOf = (id: number) => shapes.find((s) => s.id === id)
  return {
    solved: shapeOf(chain[0].id)?.solved() ?? [],
    feeders: chain.map((s) => ({ id: s.id, exit: { ...s.exit }, lane: shapeOf(s.id)?.lane() ?? null })),
  }
}

// Shared by the sidebar and the preview.
export const shotAnalyses = createRoot(() => {
  const list = mapArray(
    () => shots,
    (shot) =>
      createMemo(() => {
        const own = laneShapes().find((s) => s.id === shot.id)
        if (!own) return analyze(shot)
        const joined = shot.link === null ? null : (laneShapes().find((s) => s.id === shot.link)?.lane() ?? null)
        const feed = shotFeed(shot)
        return runLanes(shot, feed?.solved ?? own.solved(), own.lane(), joined, feed?.feeders)
      }),
  )
  return createMemo(() => list().map((analysis) => analysis()))
})

/** Whether any of one lane's outlines overlaps any of another's. */
export const outlinesOverlap = (a: Point[][], b: Point[][]) => a.some((p) => b.some((q) => polygonsOverlap(p, q)))

/**
 * The other shots each shot's lane runs into, by id. Ramps pass over other
 * lanes, and lanes joined at their exits or fed one from the other are
 * meant to meet, so none of those count.
 */
export const laneCrossings = createRoot(() =>
  createMemo(() => {
    const flat = shotAnalyses().flatMap((a) => {
      const shot = shots.find((s) => s.id === a.id)
      return a.lane && shot && !shot.ramp ? [{ shot, outlines: laneOutlines(a.lane) }] : []
    })
    const crossed = new Map<number, Shot[]>()
    const add = (id: number, other: Shot) => crossed.set(id, [...(crossed.get(id) ?? []), other])
    flat.forEach((a, i) => {
      for (const b of flat.slice(i + 1)) {
        const meant = a.shot.link === b.shot.id || a.shot.feed === b.shot.id || b.shot.feed === a.shot.id
        if (meant || !outlinesOverlap(a.outlines, b.outlines)) continue
        add(a.shot.id, b.shot)
        add(b.shot.id, a.shot)
      }
    })
    return crossed
  }),
)

/** The lane of the shot joined to `shotId`'s, as currently shaped. */
export const joinedLane = (shotId: number) => {
  const link = shots.find((s) => s.id === shotId)?.link ?? null
  return link === null ? null : (shotAnalyses().find((a) => a.id === link)?.lane ?? null)
}

export const selectedAnalysis = createRoot(() =>
  createMemo(() => shotAnalyses().find((a) => a.id === selectedId()) ?? null),
)

export const selectedSolutions = () => selectedAnalysis()?.flippers ?? []
