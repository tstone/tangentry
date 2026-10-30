import type { Point } from './flipper'

// G1 keeps the tangent continuous; G2 also keeps the curvature continuous.
export type Continuity = 'g1' | 'g2'

// How strongly the curve holds each end's direction before turning, as a
// multiplier on the default. Larger values hold the direction longer.
export type TangentWeights = { entrance: number; exit: number }

// A point on a curve with its unit tangent and distance along the curve.
export type CurveSample = { p: Point; t: Point; s: number }

// Samples taken along a lane's center line.
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
function biarc(p0: Point, t0: Point, p1: Point, t1: Point, weights: TangentWeights) {
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

  const first = arc(p0, t0, joint, SAMPLES / 2)
  // The second arc is traced backward from the exit so it lands on the exit tangent.
  const second = arc(p1, scale(t1, -1), joint, SAMPLES / 2)
    .reverse()
    .map((q) => ({ p: q.p, t: scale(q.t, -1) }))
  return [...first, ...second.slice(1)]
}

/**
 * G2 blend: a quintic Hermite curve with zero curvature at both ends, so it
 * eases in from the straight approach and out into the straight exit.
 */
function quintic(p0: Point, t0: Point, p1: Point, t1: Point, weights: TangentWeights) {
  // Tangent magnitudes default to the chord length.
  const chord = Math.hypot(p1.x - p0.x, p1.y - p0.y)
  const m0 = scale(t0, chord * weights.entrance)
  const m1 = scale(t1, chord * weights.exit)
  const points: { p: Point; t: Point }[] = []
  for (let i = 0; i <= SAMPLES; i++) {
    const u = i / SAMPLES
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
 * heading along `endDir`. Directions needn't be unit length. The lane runs
 * straight for `leadIn` inches before it starts to bend.
 */
export function laneCenterLine(
  start: Point,
  startDir: Point,
  end: Point,
  endDir: Point,
  continuity: Continuity,
  weights: TangentWeights,
  leadIn = 0,
): CurveSample[] {
  const t0 = unit(startDir)
  const t1 = unit(endDir)
  const straight: { p: Point; t: Point }[] = []
  const count = Math.ceil(leadIn / LEAD_IN_SPACING)
  for (let i = 0; i < count; i++) straight.push({ p: add(start, scale(t0, (leadIn * i) / count)), t: t0 })
  const bendStart = add(start, scale(t0, leadIn))
  const bend = continuity === 'g1' ? biarc(bendStart, t0, end, t1, weights) : quintic(bendStart, t0, end, t1, weights)
  return withLength([...straight, ...bend])
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
// width beyond that. Infinity spreads it over the whole lane.
export type LaneWidth = { entrance: number; exit: number; funnelLength: number }

/** Width of the lane at each sample along its center line. */
export const laneWidths = (curve: CurveSample[], width: LaneWidth) => {
  const total = curve[curve.length - 1]?.s || 1
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
}

// How the ball gets through the lane, best to worst, judged by its hardest
// bounce off a wall and by whether it bounces across the lane:
// - smooth: only glancing contact
// - chatter: light hits
// - ricochet: a hard hit, or one trip across to the other wall
// - rattle: a very hard hit, or bouncing back and forth across the lane
// - stalls: never makes it out of the exit
export type LaneOutcome = 'smooth' | 'chatter' | 'ricochet' | 'rattle' | 'stalls'

// Speed the ball bounces back off a wall (in/s) at which a hit reaches each
// outcome. Hitting a rigid wall that returns 60% of the speed, at 150 in/s
// these are hits at roughly 6°, 14° and 24° to the wall.
export const HIT_SEVERITY = { chatter: 9, ricochet: 21, rattle: 36 }

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
  // Speed through the exit, in/s; null if it stalls.
  exitSpeed: number | null
}

// Distance the ball travels per simulation step, inches.
const STEP_LENGTH = 0.03
const MAX_STEPS = 20000
// Below this speed into a wall (in/s), the ball stays on it and rolls along it.
const RIDE_SPEED = 2

// Fraction of the speed into a wall the ball bounces back with, at a wall
// side (1 or -1) and sample index.
export type WallRestitution = (side: number, index: number) => number

/**
 * Follow the ball through the lane from `position` with `velocity`, rolling
 * freely with `gravity` pulling toward +y and bouncing off the walls, which
 * return `restitution` of the speed into them where they're hit. Spin and wall friction are
 * ignored. Returns null if the lane is too narrow for the ball.
 *
 * Each step the ball is placed relative to the center line. If it has gone
 * further to either side than the ball's center can reach, it has hit that
 * wall: it's moved back to the wall and bounces or rolls along it. Checking
 * position rather than looking for the moment it crosses a wall means it
 * can't slip through between wall segments.
 */
export function runLane(
  curve: CurveSample[],
  width: LaneWidth,
  ballRadius: number,
  position: Point,
  velocity: Point,
  gravity: number,
  restitution: WallRestitution,
): LaneRun | null {
  // The taper is linear, so the narrowest point is at one end.
  if (Math.min(width.entrance, width.exit) / 2 <= ballRadius || curve.length < 2) return null

  const last = curve.length - 1
  const w = laneWidths(curve, width)

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
  const path = [p]
  const speeds = [Math.hypot(v.x, v.y)]
  const record = () => {
    path.push(p)
    speeds.push(Math.hypot(v.x, v.y))
  }
  const bounces: WallContact[] = []
  let firstTouch: WallContact | null = null

  const finish = (exitSpeed: number | null): LaneRun => {
    // Bounces that switch walls are trips across the lane.
    let crossings = 0
    for (let i = 1; i < bounces.length; i++) if (bounces[i].side !== bounces[i - 1].side) crossings++
    const hardest = Math.max(0, ...bounces.map((b) => b.reboundSpeed))
    const outcome: LaneOutcome =
      exitSpeed === null
        ? 'stalls'
        : crossings >= 2 || hardest >= HIT_SEVERITY.rattle
          ? 'rattle'
          : crossings === 1 || hardest >= HIT_SEVERITY.ricochet
            ? 'ricochet'
            : hardest >= HIT_SEVERITY.chatter
              ? 'chatter'
              : 'smooth'
    return { path, speeds, firstTouch, bounces, outcome, exitSpeed }
  }

  for (let step = 0; step < MAX_STEPS; step++) {
    const speed = Math.hypot(v.x, v.y)
    if (speed < 1e-3) return finish(null)
    const dt = STEP_LENGTH / speed
    p = { x: p.x + v.x * dt, y: p.y + v.y * dt + 0.5 * gravity * dt * dt }
    v = { x: v.x, y: v.y + gravity * dt }

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
        // Too gentle to bounce: the ball rolls along the wall.
        const rebound = into < RIDE_SPEED ? 0 : restitution(side, index) * into
        const contact: WallContact = {
          wall: add(here.center, scale(here.n, side * here.halfWidth)),
          ball: p,
          side,
          distance: here.distance,
          index,
          impactAngle: (Math.min(angle, Math.PI - angle) * 180) / Math.PI,
          normalSpeed: into,
          reboundSpeed: rebound,
        }
        firstTouch ??= contact
        v = add(v, scale(inward, into + rebound))
        if (into >= RIDE_SPEED) bounces.push(contact)
      }
    }
    record()
  }
  return finish(null)
}
