import { createMemo, createRoot, mapArray } from 'solid-js'
import { playfield } from './playfield'
import { centerDistance, contactBaseRadius, contactTipRadius, flippers, inertia, restAngle, torque } from './flippers'
import { ballMass } from '../physics/drive'
import { inlanes } from './inlanes'
import { ball } from './ball'
import { walls } from './walls'
import { selectedId, shots, type Entrance, type LaneAlignment, type Shot, type WallSide } from './shots'
import { flexPerSpeed, flexRestitution, wallStiffness, type MountKind } from '../physics/wall'
import { INLANE_LENGTH, computeLayout, toRadians, type Side } from './layout'
import { GRAVITY, rollingGravity, rollingSpeed, solveShot, type Departure, type FlipperSpec } from '../physics/shot'
import type { Point } from '../geometry/flipper'
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

// How the ball arrives on the flipper before the shot.
export type BallState = 'inlane' | 'cradle'

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
  approach: Approach
  side: Side
  pivot: Point
  states: Record<BallState, Solution | null>
}

/**
 * Solves shots off one flipper: how to fire it so the ball rolls through a
 * point, given as an entrance is (up from the bottom lip).
 */
export function flipperSolver(side: Side) {
  const layout = computeLayout()
  const slope = GRAVITY * Math.sin(toRadians(playfield.angle))
  const ballRadius = ball.diameter / 2
  const spec: FlipperSpec = {
    baseRadius: contactBaseRadius(),
    tipRadius: contactTipRadius(),
    length: centerDistance(),
    restAngle: toRadians(restAngle()),
    stroke: toRadians(flippers.strokeAngle),
    torque: torque(),
    inertia: inertia(),
    friction: flippers.friction,
  }
  const baseSpeeds: Record<BallState, number> = {
    inlane: rollingSpeed(ball.inlaneSpeed, slope, toRadians(inlanes.angle), INLANE_LENGTH),
    // Released from a standstill.
    cradle: 0,
  }
  const { pivot } = layout.flippers[side === 'left' ? 0 : 1]

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
    const s = solveShot({ flipper: spec, ballRadius, ballMass: ballMass(ball.diameter), slope, baseSpeed: baseSpeeds[state], target, bounds })
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

  return { pivot, solve }
}

export function solveFlippers(shot: Shot): FlipperSolutions[] {
  // Shots left of center cross from the right flipper, and vice versa.
  const crossSide: Side = shot.entrance.x < flippers.centerLine ? 'right' : 'left'

  return APPROACHES.map(({ approach }) => {
    const side: Side = approach === 'cross' ? crossSide : crossSide === 'left' ? 'right' : 'left'
    const { pivot, solve } = flipperSolver(side)
    const states = { inlane: solve(shot.entrance, 'inlane'), cradle: solve(shot.entrance, 'cradle') }
    return { approach, side, pivot, states }
  })
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
  walls: LaneWall[]
  // Solution the entrance is lined up with. Differs from the shot's
  // alignment when that one has no solution.
  alignedTo: LaneAlignment
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
  // The lane joined on at the exit, which the ball runs on through to its
  // entrance: its shot, and the samples along both center lines together.
  joined: { id: number; samples: number } | null
}

const ALIGNMENT_ORDER: LaneAlignment[] = ['cross-inlane', 'cross-cradle', 'backhand-inlane', 'backhand-cradle']

const solutionFor = (flippers: FlipperSolutions[], alignment: LaneAlignment) => {
  const [approach, state] = alignment.split('-') as [Approach, BallState]
  return flippers.find((f) => f.approach === approach)?.states[state] ?? null
}

const scaleNormal = (t: Point, side: number): Point => ({ x: normal(t).x * side, y: normal(t).y * side })

/**
 * A shot's lane, lined up with one of its solved ball paths; null if none
 * reaches the entrance.
 */
export function shapeLane(shot: Shot, solved: FlipperSolutions[]): Lane | null {
  // Use the shot's chosen solution, or the first one that exists.
  const alignedTo = [shot.alignment, ...ALIGNMENT_ORDER].find((a) => solutionFor(solved, a))
  if (!alignedTo) return null

  const reference = solutionFor(solved, alignedTo)!
  const entrance = { x: shot.entrance.x, y: playfield.height - shot.entrance.y }
  const exit = { x: shot.exit.x, y: playfield.height - shot.exit.y }
  const exitAngle = toRadians(shot.exit.angle)
  // The lane can sit off to one side of where the ball enters.
  const startDir = unit(reference.arrivalVelocity)
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
    const stiffness = wallStiffness(points, placed, walls)
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
    walls: laneWalls,
    alignedTo,
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

/** Closed outline of the space a lane takes up: along one wall and back down the other. */
export const laneOutline = (lane: Lane) => [...lane.walls[0].points, ...[...lane.walls[1].points].reverse()]

const wallOn = (lane: Lane, offset: number) => lane.walls[WALL_SIDES.findIndex((w) => w.offset === offset)]

/**
 * What the ball runs along: a lane, then on through the lane joined to its
 * exit, backward from there to that lane's entrance. Going backward swaps
 * the joined lane's walls, since its right is then on the ball's left.
 */
function track(own: Lane, joined: Lane | null) {
  const n = own.center.length
  if (!joined) {
    return {
      center: own.center,
      widths: own.widths,
      response: (offset: number, index: number) => {
        const wall = wallOn(own, offset)
        return { restitution: wall.restitution[index], flexPerSpeed: wall.flexPerSpeed[index] }
      },
    }
  }
  const length = own.center[n - 1].s + joined.center.at(-1)!.s
  // The exits are the same point, so it's kept once.
  const back = joined.center.slice(0, -1).reverse()
  const center: CurveSample[] = [
    ...own.center,
    ...back.map((q) => ({ p: q.p, t: { x: -q.t.x, y: -q.t.y }, s: length - q.s })),
  ]
  const last = center.length - 1
  return {
    center,
    widths: [...own.widths, ...joined.widths.slice(0, -1).reverse()],
    response: (offset: number, index: number) => {
      const wall = index < n ? wallOn(own, offset) : wallOn(joined, -offset)
      const i = index < n ? index : last - index
      return { restitution: wall.restitution[i], flexPerSpeed: wall.flexPerSpeed[i] }
    },
  }
}

/**
 * Which wall a ball path in a shot's analysis touched: whose lane, which
 * side (as `offsetCurve` numbers them) and which sample along it.
 */
export function contactWall(analysis: ShotAnalysis, contact: WallContact) {
  const own = analysis.lane?.center.length ?? 0
  if (!analysis.joined || contact.index < own) return { id: analysis.id, offset: contact.side, index: contact.index }
  return { id: analysis.joined.id, offset: -contact.side, index: analysis.joined.samples - 1 - contact.index }
}

/**
 * Run each of a shot's solved ball paths through its lane, and on through
 * the lane joined to its exit if there is one.
 */
function runLanes(shot: Shot, solved: FlipperSolutions[], lane: Lane | null, joined: Lane | null): ShotAnalysis {
  if (!lane) return { id: shot.id, flippers: solved, lane: null, joined: null }
  const { center, widths, response } = track(lane, joined)
  const ballRadius = ball.diameter / 2
  const gravity = rollingGravity(GRAVITY * Math.sin(toRadians(playfield.angle)))

  const flippers = solved.map((f) => ({
    ...f,
    states: Object.fromEntries(
      Object.entries(f.states).map(([state, s]) => [
        state,
        s && {
          ...s,
          lane: runLane(center, widths, ballRadius, s.arrival, s.arrivalVelocity, gravity, response),
        },
      ]),
    ) as Record<BallState, Solution | null>,
  }))

  return {
    id: shot.id,
    flippers,
    lane,
    joined: joined && shot.link !== null ? { id: shot.link, samples: center.length } : null,
  }
}

/**
 * Solve a shot's flippers and run each ball path through its lane, and on
 * through `joined`, the lane of the shot linked to it. The flipper
 * solutions depend only on the entrance, so callers trying many lane shapes
 * for one entrance can solve them once and pass them in.
 */
export function analyze(shot: Shot, solved = solveFlippers(shot), joined: Lane | null = null): ShotAnalysis {
  return runLanes(shot, solved, shapeLane(shot, solved), joined)
}

// Each shot's lane is shaped separately, so editing one doesn't re-solve
// the rest. Its ball paths are run once its own and any joined lane are.
const laneShapes = createRoot(() => {
  const list = mapArray(
    () => shots,
    (shot) => {
      const solved = createMemo(() => solveFlippers(shot))
      return { id: shot.id, solved, lane: createMemo(() => shapeLane(shot, solved())) }
    },
  )
  return createMemo(list)
})

// Shared by the sidebar and the preview.
export const shotAnalyses = createRoot(() => {
  const list = mapArray(
    () => shots,
    (shot) =>
      createMemo(() => {
        const own = laneShapes().find((s) => s.id === shot.id)
        if (!own) return analyze(shot)
        const joined = shot.link === null ? null : (laneShapes().find((s) => s.id === shot.link)?.lane() ?? null)
        return runLanes(shot, own.solved(), own.lane(), joined)
      }),
  )
  return createMemo(() => list().map((analysis) => analysis()))
})

/** The lane of the shot joined to `shotId`'s, as currently shaped. */
export const joinedLane = (shotId: number) => {
  const link = shots.find((s) => s.id === shotId)?.link ?? null
  return link === null ? null : (shotAnalyses().find((a) => a.id === link)?.lane ?? null)
}

export const selectedAnalysis = createRoot(() =>
  createMemo(() => shotAnalyses().find((a) => a.id === selectedId()) ?? null),
)

export const selectedSolutions = () => selectedAnalysis()?.flippers ?? []
