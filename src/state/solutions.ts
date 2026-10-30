import { createMemo, createRoot, mapArray } from 'solid-js'
import { playfield } from './playfield'
import { flipperShape, flippers, profile, restAngle, torque, type FlipperShape } from './flippers'
import { extraFlipperKey, extraFlippers, flipperFeed, type ExtraFlipper } from './extraFlippers'
import { ballMass, coilTorque, flipperInertia, flipperProfile, type FlipperProfile } from '../physics/drive'
import { inlanes } from './inlanes'
import { ball } from './ball'
import { walls } from './walls'
import { reservedBlocking } from './reserved'
import { focusedPart } from './focus'
import {
  endPoint,
  feedChain,
  originOf,
  otherEnd,
  selectedId,
  shotEnds,
  shots,
  type Entrance,
  type BallState,
  type Exit,
  type Feed,
  type FlipperKey,
  type LaneAlignment,
  type Leg,
  type Shot,
  type ShotEnd,
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
  // Name of the custom mech in the way of each ball path that would
  // otherwise reach the entrance; that path's state is null.
  blocked: Partial<Record<BallState, string>>
}

export type FlipperSolver = ReturnType<typeof solverFor>

/**
 * Solves shots off one flipper: how to fire it so the ball rolls through a
 * point, given as an entrance is (up from the bottom lip). `restAngle` is
 * in degrees; `torque` is its coil's; `baseSpeeds` are the ways the ball can
 * arrive on it, with its speed along the flipper as it reaches the base.
 */
function solverFor(
  side: Side,
  pivot: Point,
  stock: FlipperProfile,
  restAngle: number,
  torque: number,
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
    torque,
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
  return solverFor(side, pivot, profile(), restAngle(), torque(), {
    inlane: rollingSpeed(ball.inlaneSpeed, slope, toRadians(inlanes.angle), INLANE_LENGTH),
    // Released from a standstill.
    cradle: 0,
  })
}

/**
 * Solves shots off an extra flipper. The ball rolls onto it along its axis,
 * reaching the base at the flipper's own entrance speed, or at the speed it
 * leaves the lane feeding the flipper.
 */
export function extraFlipperSolver(flipper: ExtraFlipper) {
  const f = resolvedExtraFlipper(flipper)
  return solverFor(f.side, extraFlipperLayout(f).pivot, flipperProfile(f.profile), f.restAngle, coilTorque(f.coil), {
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
  const blocked: FlipperSolutions['blocked'] = {}
  const states = Object.fromEntries(
    solver.states.map((state) => {
      const s = solver.solve(to, state)
      // The ball can't fly through a mech on its way to the entrance.
      const by = s && reservedBlocking(s.flight, ball.diameter / 2)
      if (by) blocked[state] = by.name
      return [state, by ? null : s]
    }),
  )
  return { key, label, approach, side, pivot, shape, states, blocked }
}

/** The main flipper a cross-field shot to `entrance` comes off: entrances left of center cross from the right. */
export const crossSide = (entrance: Entrance): Side => (entrance.x < flippers.centerLine ? 'right' : 'left')

/** The flipper a shot is made off into one end of its lane, with 'auto' resolved. */
export const targetFlipper = (shot: Shot, end: ShotEnd = 'entrance'): FlipperKey => {
  const { flipper } = originOf(shot, end)
  return flipper === 'auto' ? crossSide(endPoint(shot, end)) : flipper
}

/** The ball path one end of a shot's lane is meant to line up with. An extra flipper's ball only rolls in. */
export const shotAlignment = (shot: Shot, end: ShotEnd = 'entrance'): LaneAlignment => {
  const key = targetFlipper(shot, end)
  return `${key}-${key.startsWith('extra') ? 'inlane' : originOf(shot, end).ballState}`
}

// Which flippers to solve shots off. A fed extra flipper's ball comes out
// of a lane, which is shaped and run with the ball paths off the rest, so
// those are solved apart from the fed ones: 'base' is the main pair and
// every extra flipper not fed from a lane, 'fed' the others.
type Tier = 'all' | 'base' | 'fed'

const inTier = (f: ExtraFlipper, tier: Tier) => tier === 'all' || (tier === 'fed') === (flipperFeed(f) !== null)

/**
 * Every flipper's shots through one end of a shot's lane: the main pair's,
 * cross-field first, then each extra flipper's.
 */
export function solveFlippers(shot: Shot, end: ShotEnd = 'entrance', tier: Tier = 'all'): FlipperSolutions[] {
  const to = endPoint(shot, end)
  const cross = crossSide(to)

  const main =
    tier === 'fed'
      ? []
      : APPROACHES.map(({ approach, label }) => {
          const side: Side = approach === 'cross' ? cross : cross === 'left' ? 'right' : 'left'
          return solveWith(flipperSolver(side), side, `${label} · ${side} flipper`, approach, to)
        })
  const extra = extraFlippers
    .filter((f) => inTier(f, tier))
    .map((f) => solveWith(extraFlipperSolver(f), extraFlipperKey(f.id), f.name, null, to))
  return [...main, ...extra]
}

/** The base and fed flippers' shots together, in the order `solveFlippers` gives them all. */
function mergeTiers(base: FlipperSolutions[], fed: FlipperSolutions[]) {
  if (fed.length === 0) return base
  const order = (key: FlipperKey) => extraFlippers.findIndex((f) => extraFlipperKey(f.id) === key)
  // The main pair stay first, as the sort is stable.
  return [...base, ...fed].sort((a, b) => order(a.key) - order(b.key))
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
  // alignment when that one has no solution. Null for a fed entrance,
  // which lines up with the lane end feeding it.
  alignedTo: LaneAlignment | null
  // False when the flipper chosen for the entrance has no ball path to it,
  // so the entrance points straight from that flipper's pivot instead.
  reached: boolean
  // Whether a double-ended lane's exit points back the way the ball comes
  // into it, as its entrance does. When no ball path reaches it, it points
  // the way it's set instead.
  exitLinedUp: boolean
  // Solution the exit is lined up with, as for the entrance.
  exitAlignedTo: LaneAlignment | null
  // As `reached`, for the exit.
  exitReached: boolean
  // The ball is wider than the lane.
  tooNarrow: boolean
  // Furthest a wall runs past a side rail, inches; 0 if the lane fits.
  overRail: number
  // Tightest radius of the center line and its distance along it.
  tightest: { radius: number; distance: number }
}

export type ShotAnalysis = {
  id: number
  lane: Lane | null
  // The ball paths into each end the ball is shot into: the entrance, then
  // a double-ended lane's exit.
  runs: EndRun[]
}

// The ball paths shot into one end of a lane, run through it.
export type EndRun = {
  end: ShotEnd
  flippers: FlipperSolutions[]
  // Each lane the ball paths run through, in order: any feeding this end,
  // then its own. Empty if they weren't run.
  parts: TrackPart[]
}

// A shot's lane as a stretch of the samples a ball path runs along: samples
// `first` to `last` are the lane's own from `from` on, or back from it when
// `backward`, as from a double-ended lane's exit to its entrance.
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

// How the ball comes into one end of a lane: off the flippers, along one
// of the ball paths `solved` through it, or out of the lane end feeding
// it, leaving by `from`.
export type Inlet = { solved: FlipperSolutions[]; from: Exit | null }

/**
 * The way the ball heads into a lane at `at` (SVG coordinates): along the
 * ball path lined up with `alignment`, or another if that one has no
 * solution; or for a fed end, straight across from the lane end feeding it,
 * or the way that end points if it's right there. A flipper chosen by hand
 * (`pinned`) is never swapped for another: when none of its ball paths
 * reach the end, the lane points straight from its pivot, unreached. Null if
 * no ball path reaches it.
 */
function inletDirection(at: Point, alignment: LaneAlignment, inlet: Inlet, pinned: boolean) {
  if (inlet.from) {
    const from = exitSample(inlet.from)
    const across = { x: at.x - from.p.x, y: at.y - from.p.y }
    return { dir: Math.hypot(across.x, across.y) > 1e-6 ? unit(across) : from.t, alignedTo: null, reached: true }
  }
  const aligned = alignedSolution(alignment, inlet.solved)
  const key = alignment.slice(0, alignment.lastIndexOf('-'))
  const chosen = pinned ? inlet.solved.find((f) => f.key === key) : undefined
  if (chosen && !aligned?.alignedTo.startsWith(`${key}-`)) {
    const across = { x: at.x - chosen.pivot.x, y: at.y - chosen.pivot.y }
    if (Math.hypot(across.x, across.y) > 1e-6) return { dir: unit(across), alignedTo: alignment, reached: false }
  }
  return aligned && { dir: unit(aligned.solution.arrivalVelocity), alignedTo: aligned.alignedTo, reached: true }
}

/** Furthest a lane `width` wide can sit off to one side of the ball coming into it, inches. */
export const maxOffset = (width: number) => Math.max(0, width / 2 - ball.diameter / 2)

/** A lane end's offset from the ball, held within what its width allows. */
export const fitOffset = (offset: number, width: number) => Math.max(-maxOffset(width), Math.min(maxOffset(width), offset))

/** Whether the flipper a shot is made off into one end was chosen by hand, not left automatic. */
const pinnedFlipper = (shot: Shot, end: ShotEnd) => originOf(shot, end).flipper !== 'auto'

/**
 * A shot's lane, its entrance lined up with the way the ball comes in
 * there; null if no ball path reaches it. A double-ended lane's exit lines
 * up with the way the ball comes in there too, given `exitInlet`, and
 * otherwise points the way it's set.
 */
export function shapeLane(shot: Shot, inlet: Inlet, exitInlet: Inlet | null = null): Lane | null {
  const entrance = { x: shot.entrance.x, y: playfield.height - shot.entrance.y }
  const exit = { x: shot.exit.x, y: playfield.height - shot.exit.y }
  const into = inletDirection(entrance, shotAlignment(shot), inlet, pinnedFlipper(shot, 'entrance'))
  if (!into) return null
  const startDir = into.dir
  const back =
    shot.end === 'double' && exitInlet
      ? inletDirection(exit, shotAlignment(shot, 'exit'), exitInlet, pinnedFlipper(shot, 'exit'))
      : null
  const exitAngle = toRadians(shot.exit.angle)
  const endDir = back
    ? { x: -back.dir.x, y: -back.dir.y }
    : // Screen angles are counter-clockwise; SVG y points down.
      { x: Math.cos(exitAngle), y: -Math.sin(exitAngle) }
  // The lane can sit off to one side of where the ball enters, but no
  // further than keeps the ball clear of its walls: an offset set on a
  // wider lane holds only as far as the lane's width now allows.
  const entranceOffset = fitOffset(shot.entranceOffset, shot.entranceWidth)
  const start = {
    x: entrance.x - normal(startDir).x * entranceOffset,
    y: entrance.y - normal(startDir).y * entranceOffset,
  }
  // A double-ended lane's exit is an entrance too, offset and led into the
  // same way, as seen by the ball coming in there.
  const double = shot.end === 'double'
  const backDir = { x: -endDir.x, y: -endDir.y }
  const exitOffset = fitOffset(shot.exitOffset, shot.exitWidth)
  const end = double ? { x: exit.x - normal(backDir).x * exitOffset, y: exit.y - normal(backDir).y * exitOffset } : exit
  const horseshoe = shot.end === 'horseshoe'
  const turn = toRadians(shot.horseshoe.rotation)
  const toExit = laneCenterLine(
    start,
    startDir,
    end,
    endDir,
    shot.continuity,
    { entrance: shot.entranceWeight, exit: shot.exitWeight },
    shot.leadIn,
    shot.via.map((v) => ({ x: v.x, y: playfield.height - v.y, weight: v.weight })),
    double ? shot.exitLeadIn : 0,
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
    alignedTo: into.alignedTo,
    reached: into.reached,
    exitLinedUp: back !== null,
    exitAlignedTo: back?.alignedTo ?? null,
    exitReached: back?.reached ?? true,
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

// A lane the ball runs through on its way to the next: it leaves by
// `exit`, where and about which way it heads out, having run from the
// lane's exit back to its entrance if `backward`. Its lane is null if it
// has none.
export type Feeder = { id: number; exit: Exit; lane: Lane | null; backward?: boolean }

/**
 * Where the ball leaves a shot's lane by one end, and about which way: the
 * exit's set direction, or out of a double-ended lane's end straight on
 * from the next point in, as its ends line up with the ball and aren't set.
 */
export function leavingExit(shot: Shot, leaves: ShotEnd): Exit {
  if (leaves === 'exit' && shot.end !== 'double') return { ...shot.exit }
  const at = endPoint(shot, leaves)
  const inward = leaves === 'entrance' ? shot.via : [...shot.via].reverse()
  const next = inward[0] ?? endPoint(shot, otherEnd(leaves))
  return { ...at, angle: (Math.atan2(at.y - next.y, at.x - next.x) * 180) / Math.PI }
}

// How the ball comes into one end of a lane: shot off the flippers along
// the ball paths `solved`, or through the lanes `feeders`, from the one
// shot off the flippers, whose ball paths `solved` are then, on to the one
// it leaves into this end.
export type Inflow = { solved: FlipperSolutions[]; feeders: Feeder[] }

/** The way into a lane that an inflow comes by, for shaping it. */
const inletOf = (inflow: Inflow): Inlet => ({ solved: inflow.solved, from: inflow.feeders.at(-1)?.exit ?? null })

// Spacing of the samples across open playfield, from a lane's end to the
// entrance of the lane it feeds, inches.
const GAP_SPACING = 0.05

type Placed = TrackPart & { lane: Lane }

/**
 * What the ball runs along: the lanes feeding one end of a shot's, each
 * through to the end it leaves by and then straight across open playfield
 * to the next one; then the shot's own lane, backward from its exit if
 * `backward`. Going backward through a lane swaps its walls, since its
 * right is then on the ball's left.
 */
function track(id: number, own: Lane, feeders: { id: number; lane: Lane; backward: boolean }[], backward: boolean) {
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
  // Open playfield in a straight line on to `b`, where the next lane starts `width` wide.
  const crossTo = (b: Point, width: number) => {
    const a = center.at(-1)!
    const length = Math.hypot(b.x - a.p.x, b.y - a.p.y)
    const n = Math.floor(length / GAP_SPACING)
    const t = unit({ x: b.x - a.p.x, y: b.y - a.p.y })
    const from = widths.at(-1)!
    for (let k = 1; k < n; k++) {
      const f = k / n
      push({ x: a.p.x + (b.x - a.p.x) * f, y: a.p.y + (b.y - a.p.y) * f }, t, from + (width - from) * f, true)
    }
  }
  // Samples of a lane, in the order given, across open playfield from the last.
  const addLane = (id: number, lane: Lane, indices: number[], backward: boolean) => {
    if (center.length > 0) crossTo(lane.center[indices[0]].p, lane.widths[indices[0]])
    // A lane starting where the track left off, as one fed from right
    // where another ends does, shares that point.
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
  const upTo = (count: number) => Array.from({ length: count }, (_, i) => i)
  // Entrance to exit, or back the other way.
  const through = (lane: Lane, backward: boolean) => {
    const indices = upTo(laneExit(lane).index + 1)
    return backward ? indices.reverse() : indices
  }

  for (const feeder of feeders) addLane(feeder.id, feeder.lane, through(feeder.lane, feeder.backward), feeder.backward)
  // Shot into its entrance, the ball carries on around any horseshoe.
  addLane(id, own, backward ? through(own, true) : upTo(own.center.length), backward)

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
 * Which wall a ball path in one of a shot's runs touched: whose lane, which
 * side (as `offsetCurve` numbers them) and which sample along it. Null off
 * every lane, as across open playfield between them.
 */
export function contactWall(run: EndRun, contact: WallContact) {
  const part = run.parts.find((p) => contact.index >= p.first && contact.index <= p.last)
  if (!part) return null
  return { id: part.id, offset: part.backward ? -contact.side : contact.side, index: laneIndex(part, contact.index) }
}

/**
 * Run each of the ball paths into one end of a shot's lane through it,
 * after the lanes feeding that end. A fed end's ball paths are those of
 * the first feeding lane, off the flippers.
 */
function runEnd(shot: Shot, lane: Lane | null, end: ShotEnd, inflow: Inflow): EndRun {
  // Without every lane feeding it, there's no knowing how the ball gets here.
  const feeding = inflow.feeders.flatMap((f) => (f.lane ? [{ id: f.id, lane: f.lane, backward: !!f.backward }] : []))
  if (!lane || feeding.length < inflow.feeders.length) return { end, flippers: inflow.solved, parts: [] }
  const { center, widths, open, parts, response } = track(shot.id, lane, feeding, end === 'exit')
  const ballRadius = ball.diameter / 2
  const gravity = rollingGravity(GRAVITY * Math.sin(toRadians(playfield.angle)))

  const flippers = inflow.solved.map((f) => ({
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

  return { end, flippers, parts }
}

/** A shot's lane with the ball paths into each of its ends run through it. */
const withRuns = (shot: Shot, lane: Lane | null, inflow: Inflow, exitInflow: Inflow | null): ShotAnalysis => ({
  id: shot.id,
  lane,
  runs: [
    runEnd(shot, lane, 'entrance', inflow),
    ...(shot.end === 'double' && exitInflow ? [runEnd(shot, lane, 'exit', exitInflow)] : []),
  ],
})

/**
 * Shape a shot's lane and run the ball paths into each end through it. The
 * flipper solutions depend only on where the end is, so callers trying many
 * lane shapes for one entrance can solve them once and pass them in. A
 * double-ended lane's exit is shot off the flippers unless `exitInflow`
 * says otherwise.
 */
export function analyze(
  shot: Shot,
  inflow: Inflow = { solved: solveFlippers(shot), feeders: [] },
  exitInflow: Inflow | null = shot.end === 'double' ? { solved: solveFlippers(shot, 'exit'), feeders: [] } : null,
): ShotAnalysis {
  const lane = shapeLane(shot, inletOf(inflow), exitInflow && inletOf(exitInflow))
  return withRuns(shot, lane, inflow, exitInflow)
}

const sameLeg = (a: Leg | null, b: Leg | null) => a === b || (!!a && !!b && a.shot === b.shot && a.leaves === b.leaves)

// Each shot's lane is shaped separately, so editing one doesn't re-solve
// the rest. Its ball paths are run once its own and any feeding lanes are.
// It's shaped from the base flippers' shots too, for the extra flippers it
// feeds; without fed flippers to shoot it from, that's the same lane.
const laneShapes = createRoot(() => {
  const list = mapArray(
    () => shots,
    (shot) => {
      const inletAt = (end: ShotEnd) => {
        const shotInto = () => end === 'entrance' || shot.end === 'double'
        // A fed end is shaped from the lane end feeding it, not the flippers.
        const feeder = createMemo(() => (shotInto() ? (feedChain(shot, end).at(-1) ?? null) : null), null, {
          equals: sameLeg,
        })
        const solveTier = (tier: Tier) => createMemo(() => (shotInto() && !feeder() ? solveFlippers(shot, end, tier) : []))
        const base = solveTier('base')
        const fed = solveTier('fed')
        const solved = createMemo(() => mergeTiers(base(), fed()))
        const inlet = (list: FlipperSolutions[]): Inlet => {
          const from = feeder()
          return { solved: list, from: from && leavingExit(from.shot, from.leaves) }
        }
        return { solved: { all: solved, base }, inlet }
      }
      const entrance = inletAt('entrance')
      const exit = inletAt('exit')
      const shape = (tier: 'all' | 'base') =>
        shapeLane(
          shot,
          entrance.inlet(entrance.solved[tier]()),
          shot.end === 'double' ? exit.inlet(exit.solved[tier]()) : null,
        )
      const baseLane = createMemo(() => shape('base'))
      const lane = createMemo(() =>
        entrance.solved.all() === entrance.solved.base() && exit.solved.all() === exit.solved.base()
          ? baseLane()
          : shape('all'),
      )
      return {
        id: shot.id,
        solved: { entrance: entrance.solved, exit: exit.solved },
        lane: { all: lane, base: baseLane },
      }
    },
  )
  return createMemo(list)
})

/**
 * How the ball comes into one end of a shot's lane: off the flippers, or
 * through the lanes feeding it, as they're currently shaped. With the
 * 'base' tier, only off the flippers not fed from a lane, through lanes
 * shaped from those.
 */
export function inflowOf(shot: Shot, end: ShotEnd = 'entrance', tier: 'all' | 'base' = 'all'): Inflow {
  const shapes = laneShapes()
  const shapeOf = (id: number) => shapes.find((s) => s.id === id)
  const chain = feedChain(shot, end)
  if (chain.length === 0)
    return { solved: shapeOf(shot.id)?.solved[end][tier]() ?? solveFlippers(shot, end, tier), feeders: [] }
  // The first lane is shot into by its other end.
  const first = chain[0]
  return {
    solved: shapeOf(first.shot.id)?.solved[otherEnd(first.leaves)][tier]() ?? [],
    feeders: chain.map(({ shot: s, leaves }) => ({
      id: s.id,
      exit: leavingExit(s, leaves),
      lane: shapeOf(s.id)?.lane[tier]() ?? null,
      backward: leaves === 'entrance',
    })),
  }
}

/**
 * The ball path the ball paths into one end of a shot's lane are reckoned
 * by: the one the end it's first shot into lines up with, or the one that
 * end falls back to. A fed end's ball comes off the flippers into the first
 * lane feeding it, by that lane's other end.
 */
export function targetSolution(shot: Shot, end: ShotEnd, solved: FlipperSolutions[]) {
  const first = feedChain(shot, end)[0]
  const alignment = first ? shotAlignment(first.shot, otherEnd(first.leaves)) : shotAlignment(shot, end)
  return alignedSolution(alignment, solved)
}

// What a fed extra flipper takes from the lane end feeding it, where that
// overrides its own settings. Its entrance speed is null if no ball path
// makes it out of that end.
type FedSettings = { side: Side; restAngle: number; entranceSpeed: number | null }

/**
 * How the ball leaves a lane by one end onto an extra flipper: the way the
 * lane points there, and the speed the target ball path into its other end
 * leaves at, run off the base flippers.
 */
function fedSettings(feed: Feed): FedSettings | null {
  const shot = shots.find((s) => s.id === feed.id)
  if (!shot) return null
  const lane = laneShapes()
    .find((s) => s.id === shot.id)
    ?.lane.base()
  // Out of the lane straight on from its end, back up it for a double-ended
  // lane left by its entrance.
  let angle = leavingExit(shot, feed.end).angle
  if (lane) {
    const t = feed.end === 'exit' ? laneExit(lane).sample.t : { x: -lane.center[0].t.x, y: -lane.center[0].t.y }
    // SVG y points down; angles are counter-clockwise on screen.
    angle = (Math.atan2(-t.y, t.x) * 180) / Math.PI
  }
  // The ball rolls down the flipper's axis, from base to tip: a left
  // flipper points right, so a ball heading right lands on one.
  const side: Side = Math.cos(toRadians(angle)) >= 0 ? 'left' : 'right'
  const below = side === 'left' ? -angle : angle + 180
  const restAngle = ((((below + 180) % 360) + 360) % 360) - 180

  const into = otherEnd(feed.end)
  const inflow = inflowOf(shot, into, 'base')
  const target = targetSolution(shot, into, inflow.solved)
  let entranceSpeed: number | null = null
  if (lane && target) {
    const [key, state] = target.alignedTo.split('-') as [FlipperKey, BallState]
    const flipper = inflow.solved.find((f) => f.key === key)!
    // Only the target ball path is run through.
    const run = runEnd(shot, lane, into, { ...inflow, solved: [{ ...flipper, states: { [state]: target.solution } }] })
    entranceSpeed = run.flippers[0]?.states[state]?.lane?.exitSpeed ?? null
  }
  return { side, restAngle, entranceSpeed }
}

// Each fed extra flipper's settings from the lane end feeding it, worked
// out apart so that moving one flipper doesn't re-run another's.
const fedFlippers = createRoot(() => {
  const list = mapArray(
    () => extraFlippers,
    (f) => {
      const feed = createMemo(() => flipperFeed(f), null, {
        equals: (a, b) => a === b || (!!a && !!b && a.id === b.id && a.end === b.end),
      })
      const settings = createMemo(() => {
        const from = feed()
        return from && fedSettings(from)
      })
      return { id: f.id, settings }
    },
  )
  return createMemo(list)
})

/** What an extra flipper takes from the lane end feeding it, if it's fed. */
export const fedFlipperSettings = (f: ExtraFlipper): FedSettings | null =>
  fedFlippers()
    .find((s) => s.id === f.id)
    ?.settings() ?? null

/**
 * An extra flipper as it's set up on the playfield: its own settings, or
 * those it takes from the lane end feeding it. Without a ball path out of
 * that end, it keeps its own entrance speed.
 */
export function resolvedExtraFlipper(f: ExtraFlipper): ExtraFlipper {
  if (!flipperFeed(f)) return f
  const fed = fedFlipperSettings(f)
  if (!fed) return f
  return { ...f, side: fed.side, restAngle: fed.restAngle, entranceSpeed: fed.entranceSpeed ?? f.entranceSpeed }
}

// Shared by the sidebar and the preview.
export const shotAnalyses = createRoot(() => {
  const list = mapArray(
    () => shots,
    (shot) =>
      createMemo(() => {
        const own = laneShapes().find((s) => s.id === shot.id)
        if (!own) return analyze(shot)
        return withRuns(shot, own.lane.all(), inflowOf(shot), shot.end === 'double' ? inflowOf(shot, 'exit') : null)
      }),
  )
  return createMemo(() => list().map((analysis) => analysis()))
})

/** Whether any of one lane's outlines overlaps any of another's. */
export const outlinesOverlap = (a: Point[][], b: Point[][]) => a.some((p) => b.some((q) => polygonsOverlap(p, q)))

/** Whether either end of `a` is fed by `b`. */
const feeds = (b: Shot, a: Shot) => shotEnds(a).some((end) => originOf(a, end).feed?.id === b.id)

/**
 * The other shots each shot's lane runs into, by id. Ramps pass over other
 * lanes, and lanes fed one from the other are meant to meet, so none of
 * those count.
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
        const meant = feeds(a.shot, b.shot) || feeds(b.shot, a.shot)
        if (meant || !outlinesOverlap(a.outlines, b.outlines)) continue
        add(a.shot.id, b.shot)
        add(b.shot.id, a.shot)
      }
    })
    return crossed
  }),
)

export const selectedAnalysis = createRoot(() =>
  createMemo(() => shotAnalyses().find((a) => a.id === selectedId()) ?? null),
)

/** The selected shot's ball paths, into each end it's shot into. */
export const selectedRuns = () => selectedAnalysis()?.runs ?? []

// The end of the selected shot whose ball paths are shown: the end last
// picked out on it, so picking a bend point keeps the same end in view.
// Back to the entrance whenever another shot is selected.
export const viewedEnd = createRoot(() => {
  let shot: number | null = null
  let end: ShotEnd = 'entrance'
  return createMemo(() => {
    const id = selectedId()
    const part = id === null ? null : focusedPart('shot', id)
    if (id !== shot) end = 'entrance'
    shot = id
    if (part === 'entrance' || part === 'exit') end = part
    return end
  })
})

/** The selected shot's ball paths into the end in view. */
export const viewedRuns = () => selectedRuns().filter((run) => run.end === viewedEnd())
