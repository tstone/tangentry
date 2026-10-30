import type { Point } from './flipper'
import { MAX_FLEX } from '../physics/wall'

// G1 keeps the tangent continuous; G2 also keeps the curvature continuous.
export type Continuity = 'g1' | 'g2'

// How strongly the curve holds each end's direction before turning, as a
// multiplier on the default. Larger values hold the direction longer.
export type TangentWeights = { entrance: number; exit: number }

// A point on a curve with its unit tangent and distance along the curve.
export type CurveSample = { p: Point; t: Point; s: number }

// Samples taken along each stretch of a lane's center line, between
// consecutive points it passes through.
const SAMPLES = 200

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y })
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y })
const scale = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k })
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x
export const unit = (a: Point): Point => scale(a, 1 / (Math.hypot(a.x, a.y) || 1))
// Perpendicular to `a`, a quarter turn from it.
// In SVG coordinates (y down) that's to the right of travel.
export const normal = (a: Point): Point => ({ x: -a.y, y: a.x })

/** Fill in distance along the curve for a list of points and tangents. */
function withLength(points: { p: Point; t: Point }[]): CurveSample[] {
  let s = 0
  return points.map((q, i) => {
    if (i > 0) s += Math.hypot(q.p.x - points[i - 1].p.x, q.p.y - points[i - 1].p.y)
    return { ...q, s }
  })
}

/**
 * A circular arc (or straight line) leaving `a` along unit tangent `t` and
 * passing through `b`, sampled at `count` intervals.
 */
function arc(a: Point, t: Point, b: Point, count: number) {
  const c = sub(b, a)
  const chord = Math.hypot(c.x, c.y)
  // Angle turned between the two ends.
  const sweep = 2 * Math.atan2(cross(t, c), dot(t, c))
  const n = normal(t)
  const points: { p: Point; t: Point }[] = []
  for (let i = 0; i <= count; i++) {
    const f = i / count
    if (Math.abs(sweep) < 1e-9) {
      points.push({ p: add(a, scale(c, f)), t })
      continue
    }
    // Chord length is 2r·sin(sweep/2), so curvature is 2·sin(sweep/2)/chord.
    const k = (2 * Math.sin(sweep / 2)) / chord
    const turned = sweep * f
    const p = add(a, add(scale(t, Math.sin(turned) / k), scale(n, (1 - Math.cos(turned)) / k)))
    const dir = add(scale(t, Math.cos(turned)), scale(n, Math.sin(turned)))
    points.push({ p, t: dir })
  }
  return points
}

/**
 * G1 blend: a biarc, two circular arcs meeting tangent to each other. The
 * control legs are in the ratio of the weights. Only the ratio matters, since
 * a biarc has no other freedom.
 */
function biarc(p0: Point, t0: Point, p1: Point, t1: Point, weights: TangentWeights, samples: number) {
  const a = weights.entrance
  const b = weights.exit
  const v = sub(p1, p0)
  const w = add(scale(t0, a), scale(t1, b))
  // Legs a·x and b·x: the joint sits on the line between the leg ends, a·x
  // from the first and b·x from the second, so |v − x·w| = (a + b)·x.
  const quad = 2 * a * b * (1 - dot(t0, t1))
  const vw = dot(v, w)
  let x: number
  if (Math.abs(quad) < 1e-9) {
    // Parallel end tangents.
    x = Math.abs(vw) < 1e-9 ? Math.hypot(v.x, v.y) / (2 * (a + b)) : dot(v, v) / (2 * vw)
  } else {
    x = (-vw + Math.sqrt(vw * vw + quad * dot(v, v))) / quad
  }
  const q0 = add(p0, scale(t0, a * x))
  const q1 = sub(p1, scale(t1, b * x))
  const joint = add(q0, scale(sub(q1, q0), a / (a + b)))

  const first = arc(p0, t0, joint, samples / 2)
  // The second arc is traced backward from the exit so it lands on the exit tangent.
  const second = arc(p1, scale(t1, -1), joint, samples / 2)
    .reverse()
    .map((q) => ({ p: q.p, t: scale(q.t, -1) }))
  return [...first, ...second.slice(1)]
}

/**
 * G2 blend: a quintic Hermite curve with zero curvature at both ends, so it
 * eases in from the straight approach and out into the straight exit.
 */
function quintic(p0: Point, t0: Point, p1: Point, t1: Point, weights: TangentWeights, samples: number) {
  // Tangent magnitudes default to the chord length.
  const chord = Math.hypot(p1.x - p0.x, p1.y - p0.y)
  const m0 = scale(t0, chord * weights.entrance)
  const m1 = scale(t1, chord * weights.exit)
  const points: { p: Point; t: Point }[] = []
  for (let i = 0; i <= samples; i++) {
    const u = i / samples
    const u2 = u * u
    const u3 = u2 * u
    const u4 = u3 * u
    const u5 = u4 * u
    const h0 = 1 - 10 * u3 + 15 * u4 - 6 * u5
    const h1 = u - 6 * u3 + 8 * u4 - 3 * u5
    const h4 = -4 * u3 + 7 * u4 - 3 * u5
    const h5 = 10 * u3 - 15 * u4 + 6 * u5
    const d0 = -30 * u2 + 60 * u3 - 30 * u4
    const d1 = 1 - 18 * u2 + 32 * u3 - 15 * u4
    const d4 = -12 * u2 + 28 * u3 - 15 * u4
    const d5 = 30 * u2 - 60 * u3 + 30 * u4
    const p = add(add(scale(p0, h0), scale(m0, h1)), add(scale(m1, h4), scale(p1, h5)))
    const dp = add(add(scale(p0, d0), scale(m0, d1)), add(scale(m1, d4), scale(p1, d5)))
    points.push({ p, t: unit(dp) })
  }
  return points
}

// Spacing of samples along a straight lead-in, inches.
const LEAD_IN_SPACING = 0.1

/**
 * Center line of a lane from `start` heading along `startDir` to `end`
 * heading along `endDir`, passing through each of `via` in order.
 * Directions needn't be unit length. The lane runs straight for `leadIn`
 * inches before it starts to bend, and for `leadOut` inches into `end`.
 *
 * At a via point the lane heads parallel to the line from the point before
 * it to the point after (as in a Catmull-Rom spline), and each stretch
 * between points is blended like a lane with no via points. With G2 the
 * curvature is zero where stretches meet, so it stays continuous. A via
 * point's weight shapes both stretches either side of it, as the entrance
 * and exit weights do theirs; it defaults to 1.
 */
export function laneCenterLine(
  start: Point,
  startDir: Point,
  end: Point,
  endDir: Point,
  continuity: Continuity,
  weights: TangentWeights,
  leadIn = 0,
  via: (Point & { weight?: number })[] = [],
  leadOut = 0,
): CurveSample[] {
  const t0 = unit(startDir)
  const t1 = unit(endDir)
  const straight: { p: Point; t: Point }[] = []
  const count = Math.ceil(leadIn / LEAD_IN_SPACING)
  for (let i = 0; i < count; i++) straight.push({ p: add(start, scale(t0, (leadIn * i) / count)), t: t0 })
  const bendEnd = add(end, scale(t1, -leadOut))
  const straightOut: { p: Point; t: Point }[] = []
  const outCount = Math.ceil(leadOut / LEAD_IN_SPACING)
  for (let i = 1; i <= outCount; i++) straightOut.push({ p: add(bendEnd, scale(t1, (leadOut * i) / outCount)), t: t1 })

  const points: Point[] = [add(start, scale(t0, leadIn)), ...via.map((v) => ({ x: v.x, y: v.y })), bendEnd]
  const last = points.length - 1
  const tangents = points.map((_, i) => (i === 0 ? t0 : i === last ? t1 : unit(sub(points[i + 1], points[i - 1]))))
  // Weight at each point: the entrance's, each via point's, then the exit's.
  const pointWeights = [weights.entrance, ...via.map((v) => v.weight ?? 1), weights.exit]
  const blend = continuity === 'g1' ? biarc : quintic
  const bend: { p: Point; t: Point }[] = []
  for (let i = 0; i < last; i++) {
    const w = { entrance: pointWeights[i], exit: pointWeights[i + 1] }
    const stretch = blend(points[i], tangents[i], points[i + 1], tangents[i + 1], w, SAMPLES)
    // Each stretch starts where the last one ended; keep that point once.
    bend.push(...(i === 0 ? stretch : stretch.slice(1)))
  }
  return withLength([...straight, ...bend, ...straightOut])
}

// Spacing of samples around a horseshoe turn, inches.
const TURN_SPACING = 0.05

/**
 * The curve carried on around a circular turn of `radius` from where it
 * ends, through `sweep` radians: positive turns left (counter-clockwise as
 * seen on screen), negative right.
 */
export function appendTurn(curve: CurveSample[], radius: number, sweep: number): CurveSample[] {
  const end = curve[curve.length - 1]
  if (!end || radius <= 0 || sweep === 0) return curve
  const angle = Math.abs(sweep)
  // `normal` is to the right of travel; a left turn bends the other way.
  const n = scale(normal(end.t), sweep > 0 ? -1 : 1)
  const count = Math.max(8, Math.ceil((angle * radius) / TURN_SPACING))
  const turn: CurveSample[] = []
  for (let i = 1; i <= count; i++) {
    const turned = (angle * i) / count
    turn.push({
      p: add(end.p, add(scale(end.t, radius * Math.sin(turned)), scale(n, radius * (1 - Math.cos(turned))))),
      t: add(scale(end.t, Math.cos(turned)), scale(n, Math.sin(turned))),
      s: end.s + radius * turned,
    })
  }
  return [...curve, ...turn]
}

/**
 * Tightest bend along a curve: its radius and distance along the curve.
 * Radius is Infinity for a straight curve.
 */
export function tightestBend(curve: CurveSample[]) {
  let best = { radius: Infinity, distance: 0 }
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i]
    const b = curve[i + 1]
    const ds = b.s - a.s
    if (ds <= 1e-12) continue
    const turn = Math.abs(Math.atan2(cross(a.t, b.t), dot(a.t, b.t)))
    const radius = ds / turn
    if (radius < best.radius) best = { radius, distance: (a.s + b.s) / 2 }
  }
  return best
}

// Wall-to-wall width at each end of a lane. The lane narrows (or widens)
// from the entrance width to the exit width over `funnelLength` from the
// entrance, easing in and out so the walls don't kink, and keeps the exit
// width beyond that. Infinity spreads it over the whole lane, or over the
// first `length` of it when given, as for a lane that carries on past its
// exit around a horseshoe.
export type LaneWidth = { entrance: number; exit: number; funnelLength: number; length?: number }

/** Width of the lane at each sample along its center line. */
export const laneWidths = (curve: CurveSample[], width: LaneWidth) => {
  const total = width.length || curve[curve.length - 1]?.s || 1
  return curve.map((q) => {
    const length = Math.min(width.funnelLength, total)
    const t = length > 0 ? Math.min(1, q.s / length) : 1
    return width.entrance + ((width.exit - width.entrance) * (1 - Math.cos(Math.PI * t))) / 2
  })
}

/**
 * The curve pushed sideways to the given side (1 or -1) by half the lane
 * width, less `inset`.
 */
export function offsetCurve(curve: CurveSample[], side: number, width: LaneWidth, inset = 0): Point[] {
  const w = laneWidths(curve, width)
  return curve.map((q, i) => add(q.p, scale(normal(q.t), side * (w[i] / 2 - inset))))
}

export type WallContact = {
  // Where the ball's edge touches the wall.
  wall: Point
  // Ball center at that moment.
  ball: Point
  // Which wall: 1 or -1, matching `offsetCurve`.
  side: number
  // Distance along the lane's center line.
  distance: number
  // Wall sample the ball hits, an index into `offsetCurve`'s points.
  index: number
  // Angle between the ball's travel and the wall, degrees.
  impactAngle: number
  // Speed of the ball into the wall, in/s.
  normalSpeed: number
  // Speed it bounces back off the wall with, in/s.
  reboundSpeed: number
  // Fraction of the ball's speed the hit costs it, once it's rolling again.
  speedLoss: number
  // How far the hit knocks the ball across the lane before it next touches
  // a wall, or leaves the lane, as a fraction of the room it has there: 1
  // is all the way to the other wall.
  lift: number
  // How far the wall flexes under the hit, inches.
  flex: number
}

// How the ball gets through the lane, best to worst, judged by how much
// speed its hardest bounce costs it, how far its bounces knock it across
// the lane, and whether it bounces all the way across:
// - smooth: the ball stays on or near the walls it touches
// - chatter: light hits that knock it well off a wall, or a hit that flexes
//   the wall more than MAX_FLEX
// - ricochet: a hard hit, or one trip across to the other wall
// - rattle: a very hard hit, or bouncing back and forth across the lane
// - stalls: never makes it out of the exit
// - misses: flies across an open span and misses the walls on the far side
//
// How far a hit knocks the ball across, more than its angle, is what
// matters: the outside wall of a bend soon catches a ball bouncing off it,
// so a ball shot into a bend thumps into it and rides it around, as on an
// orbit or a ramp. Off a straight wall, it carries on across.
export type LaneOutcome = 'smooth' | 'chatter' | 'ricochet' | 'rattle' | 'stalls' | 'misses'

// Fraction of its speed a hit costs the ball at which it's hard, and very
// hard. Into a wall that returns 70% of the speed into it, these are hits
// at roughly 26° and 43°.
export const HIT_SEVERITY = { ricochet: 0.1, rattle: 0.2 }
// Furthest across the lane a bounce can knock the ball, as a fraction of
// the room it has, for it to still be riding the wall.
export const HIT_LIFT = 0.25

/**
 * Whether a contact counts as a hit rather than a glancing touch: it knocks
 * the ball off the wall, or knocks the wall further than it should flex. A
 * soft wall soaks up a hit, but that's no good if it bends out of line
 * doing so.
 */
export const isHit = (contact: WallContact) => contact.lift > HIT_LIFT || contact.flex > MAX_FLEX

export type LaneRun = {
  // Ball center from the entrance to where it leaves the lane, and its
  // speed at each point.
  path: Point[]
  speeds: number[]
  // First time the ball touches a wall, however gently.
  firstTouch: WallContact | null
  // Every bounce, in order. Gentler touches are the ball rolling along a wall.
  bounces: WallContact[]
  outcome: LaneOutcome
  // Speed through the exit, in/s; null if it stalls or misses.
  exitSpeed: number | null
}

// Distance the ball travels per simulation step, inches.
const STEP_LENGTH = 0.03
const MAX_STEPS = 20000
// Below this speed into a wall (in/s), the ball stays on it and rolls along it.
const RIDE_SPEED = 2
// Furthest a bounce lifts the ball off a wall it's pressed against, inches,
// for it to count as still rolling along it: less than the wall flexes.
const RIDE_GAP = 0.01
// Coefficient of sliding friction between the ball and the playfield.
const PLAYFIELD_FRICTION = 0.15
// A solid ball's moment of inertia is 2/5·m·r², so friction at the
// playfield changes the spin's speed 5/2 times as fast as the ball's, and
// once it's rolling again the ball keeps 5/7 of its own velocity and takes
// on 2/7 of its spin's.
const SPIN_RESPONSE = 5 / 2
const ROLLING = 5 / 7
// Coefficient of friction between the ball and a steel wall.
const WALL_FRICTION = 0.3

/** Velocity a ball moving at `v` and spinning to roll at `spin` has once friction has it rolling, as [x, y]. */
const settle = (v: Point, spin: Point): [number, number] => [
  ROLLING * v.x + (1 - ROLLING) * spin.x,
  ROLLING * v.y + (1 - ROLLING) * spin.y,
]

// Accelerations from gravity on the tilted playfield, in/s²: down its
// slope, toward +y, and into its surface.
export type Incline = { slope: number; normal: number }

// How a wall responds where it's hit, at a wall side (1 or -1) and sample
// index: the fraction of the speed into it the ball bounces back with, and
// how far it flexes per in/s of that speed, inches.
export type WallResponse = (side: number, index: number) => { restitution: number; flexPerSpeed: number }

/**
 * Follow the ball through the lane from `position` with `velocity`, rolling
 * down the `incline` and bouncing off the walls, which stand `w` apart at
 * each sample of the center line and respond to each hit as `wall` gives.
 * Returns null if the lane is too narrow for the ball.
 *
 * The ball comes in rolling, spinning toward the wall as it heads into it.
 * A wall hits it at its equator, so a bounce turns the ball back, but the
 * spin is only checked by the wall's friction against the ball's surface
 * sweeping down it. Until friction with the playfield has it rolling again,
 * the spin it keeps steers it back toward the wall. Rolling along a wall,
 * it rolls on the wall as well as the playfield, which keeps its spin in
 * step with it around a bend. Friction along the wall is ignored.
 *
 * Where `open` marks a sample, the lane has no walls beside it: the ball
 * runs free there, and must be between the walls where they start again.
 *
 * Each step the ball is placed relative to the center line. If it has gone
 * further to either side than the ball's center can reach, it has hit that
 * wall: it's moved back to the wall and bounces or rolls along it. Checking
 * position rather than looking for the moment it crosses a wall means it
 * can't slip through between wall segments.
 */
export function runLane(
  curve: CurveSample[],
  w: number[],
  ballRadius: number,
  position: Point,
  velocity: Point,
  incline: Incline,
  wall: WallResponse,
  open: boolean[] = [],
): LaneRun | null {
  if (Math.min(...w) / 2 <= ballRadius || curve.length < 2) return null

  const last = curve.length - 1

  // Where a point is relative to the center line: the segment it's beside,
  // how far along that segment (beyond 0–1 past either end of the lane), and
  // its frame there. Searches from the previous segment, since the ball
  // moves only a little each step.
  let segment = 0
  const locate = (q: Point) => {
    let i = segment
    for (let tries = 0; tries < last; tries++) {
      const u = dot(sub(q, curve[i].p), sub(curve[i + 1].p, curve[i].p)) / (curve[i + 1].s - curve[i].s) ** 2
      if (u < 0 && i > 0) i--
      else if (u > 1 && i < last - 1) i++
      else break
    }
    segment = i
    const a = curve[i]
    const b = curve[i + 1]
    const u = dot(sub(q, a.p), sub(b.p, a.p)) / (b.s - a.s) ** 2
    const f = Math.min(1, Math.max(0, u))
    const tangent = unit(sub(b.p, a.p))
    const n = normal(tangent)
    const center = add(a.p, scale(sub(b.p, a.p), f))
    return {
      i,
      u,
      f,
      tangent,
      n,
      lateral: dot(sub(q, center), n),
      halfWidth: (w[i] + (w[i + 1] - w[i]) * f) / 2,
      distance: a.s + (b.s - a.s) * f,
      center,
    }
  }

  let p = position
  let v = velocity
  // The velocity the ball's spin would have it rolling at. It differs from
  // `v` while the ball slides.
  let spin = velocity
  const grip = PLAYFIELD_FRICTION * incline.normal
  const path = [p]
  const speeds = [Math.hypot(v.x, v.y)]
  const record = () => {
    path.push(p)
    speeds.push(Math.hypot(v.x, v.y))
  }
  const bounces: WallContact[] = []
  let firstTouch: WallContact | null = null
  // The last bounce, while the ball is still off the wall it bounced off.
  let lifting: WallContact | null = null

  const finish = (exitSpeed: number | null, missed = false): LaneRun => {
    // Bounces that switch walls are trips across the lane.
    let crossings = 0
    for (let i = 1; i < bounces.length; i++) if (bounces[i].side !== bounces[i - 1].side) crossings++
    const hardest = Math.max(0, ...bounces.map((b) => b.speedLoss))
    const outcome: LaneOutcome = missed
      ? 'misses'
      : exitSpeed === null
        ? 'stalls'
        : crossings >= 2 || hardest >= HIT_SEVERITY.rattle
          ? 'rattle'
          : crossings === 1 || hardest >= HIT_SEVERITY.ricochet
            ? 'ricochet'
            : bounces.some(isHit)
              ? 'chatter'
              : 'smooth'
    return { path, speeds, firstTouch, bounces, outcome, exitSpeed }
  }

  // Whether the ball was beside an open span at the last step.
  let wasOpen = false

  for (let step = 0; step < MAX_STEPS; step++) {
    const speed = Math.hypot(v.x, v.y)
    if (speed < 1e-3) return finish(null)
    const dt = STEP_LENGTH / speed
    const slip = sub(v, spin)
    const slipSpeed = Math.hypot(slip.x, slip.y)
    // Sliding: friction drags the ball one way and its spin the other,
    // closing the slip 7/2 times as fast as it slows the ball. Once it would
    // close within the step, the ball is rolling.
    if (slipSpeed > (1 + SPIN_RESPONSE) * grip * dt) {
      const drag = scale(slip, -grip / slipSpeed)
      const a = add(drag, { x: 0, y: incline.slope })
      p = add(p, add(scale(v, dt), scale(a, 0.5 * dt * dt)))
      v = add(v, scale(a, dt))
      spin = add(spin, scale(drag, -SPIN_RESPONSE * dt))
    } else {
      if (slipSpeed > 0) v = spin = add(scale(v, ROLLING), scale(spin, 1 - ROLLING))
      const a = ROLLING * incline.slope
      p = { x: p.x + v.x * dt, y: p.y + v.y * dt + 0.5 * a * dt * dt }
      v = spin = { x: v.x, y: v.y + a * dt }
    }

    const here = locate(p)
    // Past the end of the center line: out through the exit, or back out
    // through the entrance. The ball can start a hair short of the entrance,
    // so only rolling back out counts.
    if (here.i === last - 1 && here.u > 1) {
      record()
      return finish(Math.hypot(v.x, v.y))
    }
    if (here.i === 0 && here.u < 0 && dot(v, here.tangent) < 0) {
      record()
      return finish(null)
    }

    const reach = here.halfWidth - ballRadius
    // A stretch is open if either end of it is: no wall runs between them.
    if (open[here.i] || open[here.i + 1]) {
      wasOpen = true
      record()
      continue
    }
    // Back between walls after an open span: with its center outside them,
    // the ball misses the lane. Overlapping the end of a wall, it's turned
    // back in as if it had hit the wall.
    if (wasOpen && Math.abs(here.lateral) > here.halfWidth) {
      record()
      return finish(null, true)
    }
    wasOpen = false
    if (Math.abs(here.lateral) > reach) {
      const side = Math.sign(here.lateral)
      // Points from the wall back into the lane.
      const inward = scale(here.n, -side)
      // Back to where the ball meets the wall.
      p = add(p, scale(inward, Math.abs(here.lateral) - reach))
      const into = -dot(v, inward)
      if (into > 0) {
        const angle = Math.abs(Math.atan2(cross(here.tangent, v), dot(here.tangent, v)))
        const index = here.f < 0.5 ? here.i : here.i + 1
        const response = wall(side, index)
        const before = Math.hypot(...settle(v, spin))
        let rebound = response.restitution * into
        // Too gentle to bounce: the ball rolls along the wall. On the outside
        // of a bend, going around it presses the ball to the wall, which it
        // only bounces off if it would lift further than RIDE_GAP.
        const a = curve[here.i]
        const b = curve[here.i + 1]
        const curvature = cross(a.t, b.t) / (b.s - a.s)
        const outside = curvature * side < 0
        const pressed = outside ? dot(v, here.tangent) ** 2 / (1 / Math.abs(curvature) + reach) : 0
        if (into < RIDE_SPEED || rebound * rebound < 2 * pressed * RIDE_GAP) rebound = 0
        v = add(v, scale(inward, into + rebound))
        if (rebound === 0) spin = v
        else {
          // The ball's surface sweeps up or down the wall as fast as its spin
          // carries it into or away from it. Friction there, up to its share
          // of the hit, stops that, taking 5/7 of the spin's speed across the
          // wall and popping the ball up or down with the rest.
          const across = -dot(spin, inward)
          const grab = Math.min((1 - ROLLING) * Math.abs(across), WALL_FRICTION * (into + rebound))
          spin = add(spin, scale(inward, Math.sign(across) * SPIN_RESPONSE * grab))
        }
        const contact: WallContact = {
          wall: add(here.center, scale(here.n, side * here.halfWidth)),
          ball: p,
          side,
          distance: here.distance,
          index,
          impactAngle: (Math.min(angle, Math.PI - angle) * 180) / Math.PI,
          normalSpeed: into,
          reboundSpeed: rebound,
          speedLoss: before > 0 ? Math.max(0, 1 - Math.hypot(...settle(v, spin)) / before) : 0,
          lift: 0,
          flex: into * response.flexPerSpeed,
        }
        firstTouch ??= contact
        if (rebound > 0) bounces.push(contact)
        lifting = rebound > 0 ? contact : null
      }
    }
    if (lifting) {
      const across = (reach - lifting.side * dot(sub(p, here.center), here.n)) / (2 * reach)
      lifting.lift = Math.min(1, Math.max(lifting.lift, across))
    }
    record()
  }
  return finish(null)
}
