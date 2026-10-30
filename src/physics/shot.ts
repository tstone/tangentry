import type { Point } from '../geometry/flipper'

// Physics for a ball struck by a flipper. Everything here works in a
// canonical frame for a *left* flipper: origin at the pivot, x toward the
// center line, y up the playfield. Units are inches and seconds; angles are
// radians, counter-clockwise from +x (so a flipper at rest has a negative
// angle and swings up through positive ω).

// Standard gravity, in/s².
export const GRAVITY = 386.09

// A solid ball rolling without slipping accelerates at 5/7 of a sliding one.
const ROLLING = 5 / 7

export type FlipperSpec = {
  // Radii of the surface the ball contacts (the outside of the rubber).
  baseRadius: number
  tipRadius: number
  // Pivot center to tip center.
  length: number
  // Resting angle of the center line below horizontal.
  restAngle: number
  // Total angle swept from rest to the up position.
  stroke: number
  // Constant torque from the coil at the flipper shaft, g·in²/s².
  torque: number
  // Resistance of the flipper, plunger and linkage to turning, g·in².
  inertia: number
  // Coefficient of friction between the rubber and the ball.
  friction: number
}

export type ShotInput = {
  flipper: FlipperSpec
  ballRadius: number
  // Grams.
  ballMass: number
  // Component of gravity down the playfield incline, in/s².
  slope: number
  // Speed of the ball along the flipper surface as it reaches the base.
  baseSpeed: number
  target: Point
  // Region the ball center can travel in; the flight ends at a wall.
  bounds: Bounds
}

export type Bounds = { minX: number; maxX: number; maxY: number }

export type Departure = 'tip' | 'stroke-end' | 'lift-off'

export type ShotSolution = {
  // Distance of the ball along the flipper's top surface, measured from
  // where it leaves the base circle, at the moment the flipper fires.
  // Negative when fired early, with the ball still that far short of it.
  fireDistance: number
  // Time from the ball reaching the flipper base until the flipper fires;
  // negative when fired early.
  fireTime: number
  fireBall: Point
  // Ball center while it rides the flipper, fire to departure, and its
  // speed at each point.
  ride: Point[]
  rideSpeeds: number[]
  // Flipper center-line angle when the ball leaves it.
  flipperAngle: number
  departure: Point
  velocity: Point
  speed: number
  departureKind: Departure
  // Ball center in flight, departure to the target, and its speed at each point.
  flight: Point[]
  flightSpeeds: number[]
  flightTime: number
  // Ball velocity at the end of the flight, where it passes the target.
  arrivalVelocity: Point
}

/**
 * Line traced by the ball center along the flipper's top edge, in the
 * flipper's own frame (center line on +x). It's the outer tangent of the
 * base and tip circles, pushed out by the ball radius.
 */
function topSurface(f: FlipperSpec, ballRadius: number) {
  const beta = Math.asin(Math.max(-1, Math.min(1, (f.baseRadius - f.tipRadius) / f.length)))
  const u = { x: Math.cos(beta), y: -Math.sin(beta) }
  const n = { x: Math.sin(beta), y: Math.cos(beta) }
  const offset = f.baseRadius + ballRadius
  return {
    beta,
    u,
    n,
    origin: { x: offset * n.x, y: offset * n.y },
    // Where the surface meets the tip circle; past this the ball rolls off.
    length: f.length * Math.cos(beta),
  }
}

const rotate = (p: Point, a: number): Point => ({
  x: p.x * Math.cos(a) - p.y * Math.sin(a),
  y: p.x * Math.sin(a) + p.y * Math.cos(a),
})

type Strike = {
  ride: Point[]
  rideSpeeds: number[]
  position: Point
  velocity: Point
  flipperAngle: number
  kind: Departure
}

// Integration time step, seconds.
const DT = 1e-4
// Give up on a stroke that hasn't finished after this long, seconds.
const MAX_STROKE_TIME = 0.5
// Seconds between recorded points on the ride.
const RIDE_INTERVAL = 5e-4

// The ball on the flipper, partway through the stroke: `s` along the top
// surface, sliding toward the tip at `v` relative to it, with the flipper at
// `theta` turning at `omega`.
type RideStart = { s: number; v: number; theta: number; omega: number }

/**
 * Follow the ball from `start` on the flipper until it leaves it.
 *
 * The coil drives the flipper with a constant torque, and the ball pushes
 * back on it: the flipper's angular acceleration and the ball's contact
 * force are solved together each step, so a ball further out loads the
 * flipper more. While in contact the ball slides along the surface, driven
 * in the rotating frame by centrifugal force, the Euler force from the
 * flipper's angular acceleration, and gravity, and held back by friction
 * with the rubber; a gripped ball is carried around with the flipper, which
 * is what makes a backhand possible. The ball is treated as a sliding point
 * mass (no spin) and the flipper as rigid. It leaves when it rolls off the
 * tip, when the surface would have to pull on it, or when the flipper hits
 * its stop.
 */
function strike(f: FlipperSpec, ball: { radius: number; mass: number }, slope: number, start: RideStart): Strike {
  const surface = topSurface(f, ball.radius)
  const { u, n, origin } = surface
  const thetaEnd = -f.restAngle + f.stroke
  const m = ball.mass

  type State = { s: number; v: number; theta: number; omega: number }
  const ride: Point[] = []
  const rideSpeeds: number[] = []
  const at = (s: number) => ({ x: origin.x + s * u.x, y: origin.y + s * u.y })
  // Ball velocity in the flipper's frame: sliding along the surface plus
  // being carried around.
  const carried = ({ s, v, omega }: State) => {
    const q = at(s)
    return { x: v * u.x - omega * q.y, y: v * u.y + omega * q.x }
  }
  const record = (state: State) => {
    const local = carried(state)
    ride.push(rotate(at(state.s), state.theta))
    rideSpeeds.push(Math.hypot(local.x, local.y))
  }
  const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x

  /**
   * Flipper angular acceleration, and the normal force and friction (along
   * the surface, toward the tip) the rubber puts on the ball. `sliding` is
   * the ball's direction of slide, or 0 to try holding it still.
   */
  const forces = ({ s, v, theta, omega }: State, sliding: number) => {
    const q = at(s)
    // Per unit ball mass, in the flipper's frame: centrifugal, Coriolis and
    // gravity, plus the Euler force, which goes with the angular acceleration.
    const fixed = {
      x: omega * omega * q.x + 2 * omega * v * u.y - slope * Math.sin(theta),
      y: omega * omega * q.y - 2 * omega * v * u.x - slope * Math.cos(theta),
    }
    const euler = { x: q.y, y: -q.x }
    // Normal force needed to keep the ball on the surface: nA + nB·α.
    const nA = -m * (n.x * fixed.x + n.y * fixed.y)
    const nB = -m * (n.x * euler.x + n.y * euler.y)
    // Friction: fA + fB·α. Held still, it cancels the push along the surface;
    // sliding, it opposes the slide in proportion to the normal force.
    const [fA, fB] =
      sliding === 0
        ? [-m * (u.x * fixed.x + u.y * fixed.y), -m * (u.x * euler.x + u.y * euler.y)]
        : [-f.friction * sliding * nA, -f.friction * sliding * nB]
    // The flipper feels the opposite of both, at the contact point on the rubber.
    const contact = { x: q.x - ball.radius * n.x, y: q.y - ball.radius * n.y }
    const cn = cross(contact, n)
    const cu = cross(contact, u)
    // I·α = τ − (N·cn + F·cu)
    const denominator = f.inertia + nB * cn + fB * cu
    const alpha = denominator > 1e-9 ? (f.torque - nA * cn - fA * cu) / denominator : f.torque / f.inertia
    const normal = nA + nB * alpha
    const friction = fA + fB * alpha
    // Acceleration of the ball along the surface.
    const along = u.x * fixed.x + u.y * fixed.y + alpha * (u.x * euler.x + u.y * euler.y) + friction / m
    return { alpha, normal, friction, along }
  }

  const leave = (state: State, kind: Departure): Strike => {
    record(state)
    return {
      ride,
      rideSpeeds,
      position: ride[ride.length - 1],
      velocity: rotate(carried(state), state.theta),
      flipperAngle: state.theta,
      kind,
    }
  }

  // Blend two states, to place an event at the exact moment within a step.
  const between = (a: State, b: State, t: number): State => ({
    s: a.s + (b.s - a.s) * t,
    v: a.v + (b.v - a.v) * t,
    theta: a.theta + (b.theta - a.theta) * t,
    omega: a.omega + (b.omega - a.omega) * t,
  })

  let state: State = { ...start }
  let previousNormal: number | null = null
  let previous: State | null = null
  const rideEvery = Math.max(1, Math.round(RIDE_INTERVAL / DT))
  for (let step = 0; step * DT < MAX_STROKE_TIME; step++) {
    if (step % rideEvery === 0) record(state)

    const prev = state
    let result: ReturnType<typeof forces>
    if (prev.v === 0) {
      // Static friction holds the ball where it is, if it can; otherwise it
      // starts sliding the way the friction was holding it against.
      const held = forces(prev, 0)
      if (held.normal > 0 && Math.abs(held.friction) <= f.friction * held.normal) result = held
      else result = forces(prev, -Math.sign(held.friction) || 1)
    } else {
      result = forces(prev, Math.sign(prev.v))
    }

    // The surface would have to pull on the ball: it lifts off.
    if (result.normal <= 0) {
      const t = previous && previousNormal !== null && previousNormal > 0 ? previousNormal / (previousNormal - result.normal) : 1
      return leave(previous ? between(previous, prev, t) : prev, 'lift-off')
    }
    previousNormal = result.normal

    let v = prev.v + result.along * DT
    // Kinetic friction can stop a slide but never reverse it.
    if (prev.v !== 0 && Math.sign(v) !== Math.sign(prev.v)) v = 0
    const omega = prev.omega + result.alpha * DT
    state = { s: prev.s + v * DT, v, theta: prev.theta + omega * DT, omega }
    if (state.s < 0) {
      // Pinned against the base.
      state.s = 0
      state.v = Math.max(state.v, 0)
    }

    // Whichever event happens first within this step ends the ride.
    const events: [number, Departure][] = []
    if (state.s > surface.length) events.push([(surface.length - prev.s) / (state.s - prev.s), 'tip'])
    if (state.theta >= thetaEnd) events.push([(thetaEnd - prev.theta) / (state.theta - prev.theta), 'stroke-end'])
    if (events.length > 0) {
      const [t, kind] = events.reduce((a, b) => (b[0] < a[0] ? b : a))
      return leave(between(prev, state, t), kind)
    }
    previous = prev
  }
  return leave(state, 'stroke-end')
}

/**
 * Fire the flipper early, with the ball still `lead` short of the base and
 * rolling toward it at `speed`, along where the resting flipper's top
 * surface runs. The flipper swings up unloaded until its top surface meets
 * the ball; the rubber soaks up the ball's speed into it, and the ball rides
 * on from there, or rolls off a flipper already up against its stop. Null if
 * the surface meets the ball past the tip.
 */
function earlyStrike(
  f: FlipperSpec,
  ball: { radius: number; mass: number },
  slope: number,
  lead: number,
  speed: number,
): Strike | null {
  const { u, origin, length } = topSurface(f, ball.radius)
  const theta0 = -f.restAngle
  // The surface the ball center runs along is tangent to a circle about the
  // pivot, so the resting line and the line turned through `turn` cross
  // `h·tan(turn/2)` either side of their tangent points.
  const h = Math.hypot(origin.x, origin.y)
  const unloaded = f.torque / f.inertia
  const strokeTime = Math.sqrt((2 * f.stroke) / unloaded)
  const turnAt = (t: number) => (t >= strokeTime ? f.stroke : 0.5 * unloaded * t * t)
  // Ahead of the turned surface's meeting point by this much; it only grows.
  const ahead = (t: number) => -lead + speed * t + h * Math.tan(turnAt(t) / 2)
  let lo = 0
  let hi = lead / speed
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2
    if (ahead(mid) < 0) lo = mid
    else hi = mid
  }
  const t = hi
  const turn = turnAt(t)
  const s = h * Math.tan(turn / 2)
  if (s > length) return null
  const theta = theta0 + turn
  const fireBall = rotate({ x: origin.x - lead * u.x, y: origin.y - lead * u.y }, theta0)
  const at = rotate({ x: origin.x + s * u.x, y: origin.y + s * u.y }, theta)
  const m = ball.mass

  // The ball's velocity, along and into the turned surface.
  const along = speed * Math.cos(turn)
  const into = speed * Math.sin(turn)
  if (t >= strokeTime) {
    // Up against its stop, the flipper stands still: the ball's speed into
    // it is lost and friction drags on the rest as it rolls off along it.
    const v = Math.max(0, along - f.friction * into)
    return {
      ride: [fireBall, at],
      rideSpeeds: [speed, v],
      position: at,
      velocity: rotate({ x: v * u.x, y: v * u.y }, theta),
      flipperAngle: theta,
      kind: 'stroke-end',
    }
  }

  // The surface where it meets the ball moves into it at ω·s and back
  // toward the base at ω·h. The impact stops the ball's motion into the
  // surface, which the flipper feels at arm `s`; friction drags on its slide
  // along it, at arm `h − r` from the pivot.
  const omega = unloaded * t
  const closing = into + omega * s
  const normal = closing / (1 / m + (s * s) / f.inertia)
  const slide = along + omega * h
  const friction = Math.min(f.friction * normal, Math.max(0, slide) * m)
  const omegaAfter = omega - (normal * s + friction * (h - ball.radius)) / f.inertia
  const ride = strike(f, ball, slope, {
    s,
    v: along - friction / m + omegaAfter * h,
    theta,
    omega: Math.max(0, omegaAfter),
  })
  return { ...ride, ride: [fireBall, ...ride.ride], rideSpeeds: [speed, ...ride.rideSpeeds] }
}

type Flight = {
  // Signed perpendicular distance from the path to the target at closest
  // approach; positive when the target is left of the direction of travel.
  miss: number
  // Unsigned distance from the target at closest approach.
  distance: number
  time: number
}

const flightAt = (p: Point, v: Point, g: number, t: number): Point => ({
  x: p.x + v.x * t,
  y: p.y + v.y * t - 0.5 * g * t * t,
})

/**
 * Closest approach of a rolling ball's parabolic path to `target`, up to
 * where it hits a wall or falls back below both its start and the target.
 */
function closestApproach(p: Point, v: Point, g: number, target: Point, bounds: Bounds): Flight {
  // Follow the ball until it has dropped well below both its start and the target.
  const floor = Math.min(p.y, target.y) - 2
  const tEnd = g > 0 ? (v.y + Math.sqrt(Math.max(0, v.y * v.y + 2 * g * (p.y - floor)))) / g : 5
  const distance = (t: number) => {
    const q = flightAt(p, v, g, t)
    return Math.hypot(q.x - target.x, q.y - target.y)
  }

  const inside = (q: Point) => q.x >= bounds.minX && q.x <= bounds.maxX && q.y <= bounds.maxY

  const SAMPLES = 400
  let best = 0
  let bestDistance = distance(0)
  // Time the ball reaches a wall, or the end of the search.
  let stop = tEnd
  for (let i = 1; i <= SAMPLES; i++) {
    const t = (tEnd * i) / SAMPLES
    if (!inside(flightAt(p, v, g, t))) {
      // Pin down the wall between this sample and the last one.
      let inLo = (tEnd * (i - 1)) / SAMPLES
      let outHi = t
      for (let j = 0; j < 30; j++) {
        const mid = (inLo + outHi) / 2
        if (inside(flightAt(p, v, g, mid))) inLo = mid
        else outHi = mid
      }
      stop = inLo
      if (distance(stop) < bestDistance) best = i
      break
    }
    const d = distance(t)
    if (d < bestDistance) {
      best = i
      bestDistance = d
    }
  }
  // Refine between the neighboring samples.
  let lo = (tEnd * Math.max(0, best - 1)) / SAMPLES
  let hi = Math.min(stop, (tEnd * (best + 1)) / SAMPLES)
  for (let i = 0; i < 40; i++) {
    const m1 = lo + (hi - lo) / 3
    const m2 = hi - (hi - lo) / 3
    if (distance(m1) < distance(m2)) hi = m2
    else lo = m1
  }
  const time = (lo + hi) / 2
  const q = flightAt(p, v, g, time)
  const vel = { x: v.x, y: v.y - g * time }
  const speed = Math.hypot(vel.x, vel.y) || 1
  return {
    miss: (vel.x * (target.y - q.y) - vel.y * (target.x - q.x)) / speed,
    distance: Math.hypot(q.x - target.x, q.y - target.y),
    time,
  }
}

// Fire positions sampled along the flipper when searching for a solution.
const SEARCH_SAMPLES = 40
// How close the path must pass to the target to count as a hit, inches.
const HIT_TOLERANCE = 0.05

/**
 * Find where along the flipper the ball must be when the flipper fires so
 * that it rolls through `target`, or how far short of the flipper when
 * fired early. Returns null if no fire position works. When several do, the
 * earliest with the ball on the flipper is used, and failing those, the
 * latest early one.
 */
export function solveShot(input: ShotInput): ShotSolution | null {
  const { flipper, ballRadius, ballMass, slope, baseSpeed, target, bounds } = input
  const numbers = [ballRadius, ballMass, slope, baseSpeed, target.x, target.y, ...Object.values(flipper), ...Object.values(bounds)]
  if (!numbers.every(Number.isFinite)) return null
  if (flipper.length <= 0 || flipper.stroke <= 0 || flipper.torque <= 0 || flipper.inertia <= 0 || ballMass <= 0)
    return null

  const surface = topSurface(flipper, ballRadius)
  // Before the flip the ball rolls down the resting flipper's top surface.
  const approach = ROLLING * slope * Math.sin(flipper.restAngle + surface.beta)
  const flightGravity = rollingGravity(slope)

  const ball = { radius: ballRadius, mass: ballMass }
  // A negative `s` fires the flipper early, with the ball that far short of
  // the base.
  const evaluate = (s: number) => {
    let speed = baseSpeed
    let hit: Strike | null
    if (s < 0) hit = earlyStrike(flipper, ball, slope, -s, baseSpeed)
    else {
      const speedSquared = baseSpeed * baseSpeed + 2 * approach * s
      if (speedSquared < 0) return null
      speed = Math.sqrt(speedSquared)
      hit = strike(flipper, ball, slope, { s, v: speed, theta: -flipper.restAngle, omega: 0 })
    }
    if (!hit) return null
    const flight = closestApproach(hit.position, hit.velocity, flightGravity, target, bounds)
    return { s, speed, hit, flight }
  }

  /** The first fire position from `from` to `to` that sends the ball through the target. */
  const search = (from: number, to: number) => {
    let previous = evaluate(from)
    for (let i = 1; i <= SEARCH_SAMPLES; i++) {
      const current = evaluate(from + ((to - from) * i) / SEARCH_SAMPLES)
      if (previous && current && Math.sign(previous.flight.miss) !== Math.sign(current.flight.miss)) {
        let lo = previous
        let hi = current
        for (let j = 0; j < 40; j++) {
          const mid = evaluate((lo.s + hi.s) / 2)
          if (!mid) break
          if (Math.sign(mid.flight.miss) === Math.sign(lo.flight.miss)) lo = mid
          else hi = mid
        }
        const found = lo.flight.distance < hi.flight.distance ? lo : hi
        // A sign flip can also come from a jump in the path rather than a hit.
        if (found.flight.distance < HIT_TOLERANCE) return toSolution(found)
      }
      previous = current
    }
    return null
  }

  // Firing with the ball on the flipper first. Failing that, a rolling ball
  // can be met by a flipper fired early, already swinging when it gets there;
  // any earlier than the flipper takes to reach its stop is the same as that.
  const strokeTime = Math.sqrt((2 * flipper.stroke * flipper.inertia) / flipper.torque)
  return search(0, surface.length) ?? (baseSpeed > 0 ? search(0, -baseSpeed * strokeTime * 1.05) : null)

  function toSolution(found: NonNullable<ReturnType<typeof evaluate>>): ShotSolution {
    const { s, speed, hit, flight } = found
    const fireTime =
      s < 0
        ? s / baseSpeed
        : approach > 1e-9
          ? (speed - baseSpeed) / approach
          : baseSpeed > 0
            ? s / baseSpeed
            : Infinity
    const steps = 60
    return {
      fireDistance: s,
      fireTime,
      fireBall: hit.ride[0],
      ride: hit.ride,
      rideSpeeds: hit.rideSpeeds,
      flipperAngle: hit.flipperAngle,
      departure: hit.position,
      velocity: hit.velocity,
      speed: Math.hypot(hit.velocity.x, hit.velocity.y),
      departureKind: hit.kind,
      flight: Array.from({ length: steps + 1 }, (_, i) =>
        flightAt(hit.position, hit.velocity, flightGravity, (flight.time * i) / steps),
      ),
      flightSpeeds: Array.from({ length: steps + 1 }, (_, i) => {
        const t = (flight.time * i) / steps
        return Math.hypot(hit.velocity.x, hit.velocity.y - flightGravity * t)
      }),
      flightTime: flight.time,
      arrivalVelocity: { x: hit.velocity.x, y: hit.velocity.y - flightGravity * flight.time },
    }
  }
}

/** Acceleration of a ball rolling freely down the incline, in/s². */
export const rollingGravity = (slope: number) => ROLLING * slope

/** Speed after rolling `distance` down a guide at `angle` below horizontal. */
export function rollingSpeed(startSpeed: number, slope: number, angle: number, distance: number) {
  return Math.sqrt(Math.max(0, startSpeed * startSpeed + 2 * ROLLING * slope * Math.sin(angle) * distance))
}
