import type { Point } from '../geometry/flipper'
import type { Side } from './layout'
import { normal, runLane, type CurveSample, type Incline, type OpenSides, type WallResponse } from '../geometry/lane'

// How hard a shot is, judged by how far off the player's timing can be and
// still make it. Fire the flipper a little early or late and the ball
// leaves it at a different angle and speed; the timing window is the span
// of fire times either side of the solved one that still carry the ball
// through the lane. Everything that makes a shot hard comes through in it:
// a fast ball runs down the flipper further per millisecond, a narrow lane
// or a far one leaves less room for the angle to be off, and some parts of
// the flipper turn a timing error into more of an angle than others.

// The ball off the flipper fired with it `fireDistance` along it, as a
// solution's `fireDistance` is reckoned, in SVG coordinates.
export type Refire = (fireDistance: number) => { fireTime: number; departure: Point; velocity: Point } | null

// What the ball runs along once it's shot into a lane, as `runLane` takes it.
export type Track = {
  center: CurveSample[]
  widths: number[]
  open: OpenSides
  response: WallResponse
  ballRadius: number
  incline: Incline
}

export type TimingWindow = {
  // Earliest and latest fire times that still make the shot, seconds, as
  // a solution's `fireTime` is reckoned.
  early: number
  late: number
  // Fire positions there, as `fireDistance` is reckoned.
  earlyDistance: number
  lateDistance: number
  // What goes wrong just past each end; null where the window runs up
  // against the furthest the flipper can be fired early or late.
  earlyLimit: Limit | null
  lateLimit: Limit | null
  // Side of the flipper the shot comes off.
  side: Side
}

// Why a shot fired a little off doesn't make it:
// - wall-left, wall-right: the ball hits the end of that wall at the mouth
//   and is turned away
// - blocked: it runs into something on its way there
// - stalls, misses: it gets in but doesn't make it through, as for a lane run
// - no-strike: the flipper fired then never sends the ball at the mouth
export type Limit = 'wall-left' | 'wall-right' | 'blocked' | 'stalls' | 'misses' | 'no-strike'

export const LIMIT_LABELS: Record<Limit, string> = {
  'wall-left': 'hits the end of the left wall',
  'wall-right': 'hits the end of the right wall',
  blocked: 'runs into something on the way',
  stalls: 'stalls in the lane',
  misses: 'misses the lane past a gap',
  'no-strike': "doesn't head for the lane",
}

/** Span of the window, seconds. */
export const windowSpan = (w: TimingWindow) => w.late - w.early

// Most players are right-handed and time the right flipper a little better,
// so a shot off a left flipper is rated as if its window were this much of
// what it is.
const LEFT_HANDED = 0.95

/**
 * The window's span as it's rated, seconds: a little narrower off a left
 * flipper, for the right-handed player.
 */
export const ratedSpan = (w: TimingWindow) => windowSpan(w) * (w.side === 'left' ? LEFT_HANDED : 1)

/** Middle of the window: the time to aim for, seconds. */
export const windowMiddle = (w: TimingWindow) => (w.early + w.late) / 2

// Step out from the solved fire position by this much at a time looking
// for the edge of the window, inches, then pin it down by halving.
const STEP = 0.04
const REFINE = 12

/**
 * Where the ball's flight off the flipper crosses the line across the
 * mouth of the track, and its velocity there. Rolling down the incline
 * pulls it toward +y.
 */
function crossMouth(departure: Point, velocity: Point, gravity: number, mouth: CurveSample) {
  const t0 = mouth.t
  // Distance along the track's start direction: c + b·t + a·t² = 0.
  const c = (departure.x - mouth.p.x) * t0.x + (departure.y - mouth.p.y) * t0.y
  const b = velocity.x * t0.x + velocity.y * t0.y
  const a = 0.5 * gravity * t0.y
  let t: number
  if (Math.abs(a) < 1e-9) t = b > 0 ? -c / b : -1
  else {
    const disc = b * b - 4 * a * c
    if (disc < 0) return null
    const roots = [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)].filter((r) => r >= 0)
    t = roots.length > 0 ? Math.min(...roots) : -1
  }
  if (!(t >= 0)) return null
  return {
    time: t,
    position: { x: departure.x + velocity.x * t, y: departure.y + velocity.y * t + 0.5 * gravity * t * t },
    velocity: { x: velocity.x, y: velocity.y + gravity * t },
  }
}

// Points sampled along the flight to the mouth, to check what it runs into.
const FLIGHT_SAMPLES = 24

/**
 * Whether firing with the ball `fireDistance` along the flipper makes the
 * shot: the ball flies to the mouth of the track without running into
 * anything, gets in without hitting the end of a wall there, and out the
 * far end. The fire time if it does, or why not.
 */
function makes(
  refire: Refire,
  fireDistance: number,
  track: Track,
  gravity: number,
  blocked: (flight: Point[]) => boolean,
): { time: number } | { limit: Limit } {
  const fired = refire(fireDistance)
  if (!fired) return { limit: 'no-strike' }
  const mouth = track.center[0]
  const into = crossMouth(fired.departure, fired.velocity, gravity, mouth)
  if (!into) return { limit: 'no-strike' }
  const flight = Array.from({ length: FLIGHT_SAMPLES + 1 }, (_, i) => {
    const t = (into.time * i) / FLIGHT_SAMPLES
    return {
      x: fired.departure.x + fired.velocity.x * t,
      y: fired.departure.y + fired.velocity.y * t + 0.5 * gravity * t * t,
    }
  })
  if (blocked(flight)) return { limit: 'blocked' }
  // With its center past a wall, the ball hits the end of it and is turned
  // away; inside it, the wall's end turns it into the lane.
  const n = normal(mouth.t)
  const lateral = (into.position.x - mouth.p.x) * n.x + (into.position.y - mouth.p.y) * n.y
  const walled = lateral < 0 ? !track.open.left[0] : !track.open.right[0]
  if (Math.abs(lateral) > track.widths[0] / 2 && walled) return { limit: lateral < 0 ? 'wall-left' : 'wall-right' }
  const run = runLane(
    track.center,
    track.widths,
    track.ballRadius,
    into.position,
    into.velocity,
    track.incline,
    track.response,
    track.open,
  )
  if (!run) return { limit: 'stalls' }
  if (run.exitSpeed === null) return { limit: run.outcome === 'misses' ? 'misses' : 'stalls' }
  return { time: fired.fireTime }
}

/**
 * The window of fire times around the solved one, at `fireDistance`, that
 * still make the shot. Null if the solved shot itself doesn't. Only the
 * stretch of fire positions the solved one is in counts: another stretch
 * further along the flipper is a different shot.
 */
export function timingWindow(
  refire: Refire,
  fireDistance: number,
  range: [number, number],
  track: Track,
  gravity: number,
  blocked: (flight: Point[]) => boolean,
  side: Side,
): TimingWindow | null {
  const test = (s: number) => makes(refire, s, track, gravity, blocked)
  const at = test(fireDistance)
  if (!('time' in at)) return null
  type Good = { s: number; time: number }

  /** The last fire position from the solved one toward `direction` that still makes it, and why the next doesn't. */
  const edge = (direction: number): Good & { limit: Limit | null } => {
    const end = direction < 0 ? range[0] : range[1]
    let good: Good = { s: fireDistance, time: at.time }
    for (;;) {
      // Up against the end of the range, the window is cut off there.
      const s = direction * (good.s + direction * STEP - end) > 0 ? end : good.s + direction * STEP
      const result = test(s)
      if (!('time' in result)) return refine(good, s, result.limit)
      if (s === end) return { s, time: result.time, limit: null }
      good = { s, time: result.time }
    }
  }
  const refine = (good: Good, bad: number, limit: Limit) => {
    for (let i = 0; i < REFINE; i++) {
      const s = (good.s + bad) / 2
      const result = test(s)
      if ('time' in result) good = { s, time: result.time }
      else {
        bad = s
        limit = result.limit
      }
    }
    return { ...good, limit }
  }

  const early = edge(-1)
  const late = edge(1)
  return {
    early: early.time,
    late: late.time,
    earlyDistance: early.s,
    lateDistance: late.s,
    earlyLimit: early.limit,
    lateLimit: late.limit,
    side,
  }
}

// How hard a shot is, by its timing window.
export type Difficulty = 'easy' | 'moderate' | 'hard' | 'very-hard' | 'none'

// Narrowest window for each difficulty, milliseconds, easiest first.
// Anything narrower is very hard. Fitted to a layout drawn over a real
// game, against how hard its shots feel to play: windows of about 18 ms
// for its easiest shots off the inlane, 10–12 ms for middling ones, and
// under 6 ms for the hardest.
export const DIFFICULTY_BANDS: { difficulty: Difficulty; label: string; minMs: number }[] = [
  { difficulty: 'easy', label: 'Easy', minMs: 17 },
  { difficulty: 'moderate', label: 'Moderate', minMs: 11 },
  { difficulty: 'hard', label: 'Hard', minMs: 7 },
  { difficulty: 'very-hard', label: 'Very hard', minMs: 0 },
]

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  moderate: 'Moderate',
  hard: 'Hard',
  'very-hard': 'Very hard',
  none: 'No window',
}

/** A timing window's difficulty band. */
export function difficultyOf(w: TimingWindow | null): Difficulty {
  if (!w) return 'none'
  const ms = ratedSpan(w) * 1000
  return DIFFICULTY_BANDS.find((b) => ms >= b.minMs)?.difficulty ?? 'very-hard'
}
