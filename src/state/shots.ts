import { batch } from 'solid-js'
import { createStore } from 'solid-js/store'
import { playfield } from './playfield'
import { focusOn, focusedId, unfocus, unfocusPart } from './focus'
import type { Continuity } from '../geometry/lane'
import type { MountKind } from '../physics/wall'

// All dimensions are in inches, angles in degrees.
export type Entrance = {
  // Center of the entrance, measured from the left edge of the playfield.
  x: number
  // Center of the entrance, measured up from the bottom lip of the playfield.
  y: number
}

export type Exit = Entrance & {
  // Direction the lane leaves in, counter-clockwise from the playfield's +x
  // axis as seen on screen (90° is straight up the playfield).
  angle: number
}

// Which flipper a ball path comes off: one of the main pair, by side, or an
// extra flipper, by id.
export type FlipperKey = 'left' | 'right' | `extra${number}`

// The flipper a shot is made off. 'auto' is the main flipper across the
// playfield from the entrance.
export type TargetFlipper = 'auto' | FlipperKey

// How the ball arrives on the flipper before the shot.
export type BallState = 'inlane' | 'cradle'

// A solved ball path, as `${flipperKey}-${ballState}`.
export type LaneAlignment = `${FlipperKey}-${BallState}`

// The two ends of a lane. A double-ended lane's exit is an entrance too.
export type ShotEnd = 'entrance' | 'exit'

// The end of a shot's lane the ball leaves by, into the lane it feeds.
export type Feed = { id: number; end: ShotEnd }

// Where the ball comes from into one end of a lane.
export type Origin = {
  // The ball path the end is lined up with: off this flipper, arriving
  // this way. An extra flipper's ball only rolls in.
  flipper: TargetFlipper
  ballState: BallState
  // Line the end up between the ball paths off both main flippers, as a
  // center shot made off either is, instead of with this one's alone. Only
  // for the main pair's shots.
  split: boolean
  // The lane whose end feeds this one: the ball leaves that lane, crosses
  // open playfield and comes into this one, as where a lane is cut to
  // leave room for balls on their way to other shots. A fed end isn't shot
  // from the flippers; its ball comes through the lanes feeding it.
  feed: Feed | null
}

// Lane walls, left and right as the ball sees them heading in.
export type WallSide = 'left' | 'right'

export type WallMount = {
  id: number
  kind: MountKind
  // Position along the wall from the entrance, as a fraction of its length,
  // so mounts stay put relative to the wall as the lane is reshaped.
  at: number
}

export type Shot = {
  id: number
  name: string
  entrance: Entrance
  // Wall to wall at each end of the lane, tapering linearly in between.
  entranceWidth: number
  exitWidth: number
  exit: Exit
  continuity: Continuity
  // How long the lane holds the entrance and exit directions before
  // turning, as multipliers on the default (1).
  entranceWeight: number
  exitWeight: number
  // Where the ball comes into the entrance from, as an Origin.
  flipper: TargetFlipper
  ballState: BallState
  split: boolean
  feed: Feed | null
  // How far the lane's center sits from the ball where it enters, inches.
  // Positive puts the ball nearer the right wall.
  entranceOffset: number
  // How far the lane turns from the way the ball comes into it, degrees,
  // counter-clockwise on screen, about where the ball crosses the mouth.
  // The ball then crosses the mouth at an angle, as into an orbit whose
  // line is set by the side rail.
  entrancePivot: number
  // Straight run before the lane starts to bend, inches.
  leadIn: number
  // A double-ended lane's exit is offset, pivoted and led into the same
  // way, as seen by the ball coming in there. Unused for other lanes.
  exitOffset: number
  exitPivot: number
  exitLeadIn: number
  // Distance from the entrance over which the lane narrows to the exit
  // width, inches. Infinity spreads it over the whole lane.
  funnelLength: number
  // Points between the entrance and exit the lane passes through, in order,
  // for shapes a single bend can't make.
  via: ViaPoint[]
  mounts: Record<WallSide, WallMount[]>
  // What the lane does at its exit.
  end: LaneEnd
  // Where the ball comes into a double-ended lane's exit from.
  exitOrigin: Origin
  horseshoe: Horseshoe
  // A ramp rises off the playfield, so it may pass over other lanes.
  // Lanes on the playfield can't cross each other.
  ramp: boolean
  // Stretches with no walls, where the lane crosses space the ball needs
  // clear to reach other shots. The ball runs free across each one.
  openSpans: OpenSpan[]
}

// Where an open span starts and ends along the lane, as fractions of the
// distance to the exit, so it stays put relative to the lane as it's reshaped.
export type OpenSpan = { from: number; to: number }

// Open lanes end at the exit; a horseshoe carries the lane on around a
// circular turn from there, keeping the exit width. A double-ended lane's
// exit is a second entrance, as an orbit's is: a ball shot into either end
// leaves by the other.
export type LaneEnd = 'open' | 'horseshoe' | 'double'

export type Horseshoe = {
  // How far around the turn goes, degrees: positive turns left
  // (counter-clockwise on screen), negative right. 180 heads back the way
  // the lane came.
  rotation: number
  // Of the turn's center line, inches.
  radius: number
}

export const HORSESHOE_ROTATION = { min: -270, max: 270 }
export const HORSESHOE_RADIUS = { min: 1, max: 12 }

export type ViaPoint = Entrance & {
  id: number
  // How long the lane holds its direction through the point, either side of
  // it, as a multiplier on the default (1), as the entrance and exit weights.
  weight: number
}

const [shots, setShots] = createStore<Shot[]>([])

// The shot in focus, whose ball paths are shown on the playfield.
export const selectedId = () => focusedId('shot')

/** Focus a shot the user picked out, or let go of the focused shot. */
export function setSelectedId(id: number | null) {
  if (id === null) unfocus('shot')
  else focusOn('shot', id)
}

export const selectedShot = () => shots.find((shot) => shot.id === selectedId())

let nextId = 1
let nextMountId = 1
let nextViaId = 1

export const DEFAULT_HORSESHOE: Horseshoe = { rotation: 180, radius: 2.5 }

export const DEFAULT_ORIGIN: Origin = { flipper: 'auto', ballState: 'inlane', split: false, feed: null }

/** The ends of a shot's lane the ball can be shot into: the entrance, and the exit if it's double-ended. */
export const shotEnds = (shot: Shot): ShotEnd[] => (shot.end === 'double' ? ['entrance', 'exit'] : ['entrance'])

export const otherEnd = (end: ShotEnd): ShotEnd => (end === 'entrance' ? 'exit' : 'entrance')

/** Where the ball comes into one end of a shot's lane from. */
export const originOf = (shot: Shot, end: ShotEnd): Origin =>
  end === 'entrance'
    ? { flipper: shot.flipper, ballState: shot.ballState, split: shot.split, feed: shot.feed }
    : shot.exitOrigin

/** How far one end of a shot's lane turns from the way the ball comes into it, degrees. */
export const pivotOf = (shot: Shot, end: ShotEnd) => (end === 'entrance' ? shot.entrancePivot : shot.exitPivot)

/** Where one end of a shot's lane is. */
export const endPoint = (shot: Shot, end: ShotEnd): Entrance =>
  end === 'entrance' ? shot.entrance : { x: shot.exit.x, y: shot.exit.y }

/** How one end of a shot's lane is named: either end of a double-ended lane, or its exit. */
export const endName = (shot: Shot, end: ShotEnd) => `${shot.name}'s ${end}${shot.end === 'double' ? ' end' : ''}`

/** Whether the ball can leave a shot's lane by `end`, to feed another: any end but a horseshoe's. */
export const canLeaveBy = (shot: Shot, end: ShotEnd) =>
  end === 'exit' ? shot.end !== 'horseshoe' : shot.end === 'double'

/**
 * Whether the ball can leave a shot's lane by `end` onto an extra flipper:
 * any end it can leave by into another lane, and a single-ended lane's
 * entrance too, the ball rolling back out from rest at its far end, as off
 * a target, captive ball or magnet there, or a wireform dropping it in.
 */
export const canFeedFlipper = (shot: Shot, end: ShotEnd) => end === 'entrance' || canLeaveBy(shot, end)

/** Whether a flipper fed by `end` of a shot gets a ball rolling back out from rest at the lane's far end. */
export const rollsBackFrom = (shot: Shot, end: ShotEnd) => end === 'entrance' && shot.end !== 'double'

// Spade bolts near each end and a spike between, given ids by `id`.
const defaultMounts = (id: () => number): WallMount[] => [
  { id: id(), kind: 'spade', at: 0.05 },
  { id: id(), kind: 'spike', at: 0.5 },
  { id: id(), kind: 'spade', at: 0.95 },
]

/**
 * A new shot's settings, with its lane from `entrance` straight up the
 * playfield. Not added to the shots; ids are placeholders.
 */
export const shotDefaults = (entrance: Entrance): Shot => ({
  id: -1,
  name: '',
  entrance,
  entranceWidth: 2.5,
  exitWidth: 2.25,
  exit: { x: entrance.x, y: entrance.y + 6, angle: 90 },
  continuity: 'g2',
  entranceWeight: 1,
  exitWeight: 1,
  flipper: 'auto',
  ballState: 'inlane',
  split: false,
  ramp: false,
  entranceOffset: 0,
  entrancePivot: 0,
  leadIn: 0,
  exitOffset: 0,
  exitPivot: 0,
  exitLeadIn: 0,
  funnelLength: Infinity,
  via: [],
  mounts: { left: defaultMounts(() => -1), right: defaultMounts(() => -1) },
  feed: null,
  end: 'open',
  exitOrigin: { ...DEFAULT_ORIGIN },
  horseshoe: { ...DEFAULT_HORSESHOE },
  openSpans: [],
})

type NewShot = Partial<Omit<Shot, 'id' | 'via' | 'mounts'>> & { via?: Entrance[] }

// How far apart a new double-ended lane's ends are, and how far its arch
// rises above them, inches.
const ARCH_SPAN = 10
const ARCH_RISE = 8

/**
 * A double-ended lane arching up from `entrance`, as an orbit does: over a
 * bend point at the top and back down to the exit to its right. Ends lying
 * straight up from each other would leave the lane nowhere to turn.
 */
const archFrom = (entrance: Entrance): Pick<NewShot, 'exit' | 'via'> => ({
  via: [{ x: entrance.x + ARCH_SPAN / 2, y: entrance.y + ARCH_RISE }],
  // Heading back down, leaning in a little, as the entrance leans out.
  exit: { x: entrance.x + ARCH_SPAN, y: entrance.y, angle: -100 },
})

/** Add a shot and select it, returning its id. */
export function addShot(options: NewShot = {}) {
  const id = nextId++
  // Start somewhere in the upper playfield; the user will drag it into place.
  // A new double-ended lane arches over the middle instead.
  const arch = options.end === 'double' && !options.exit && !options.via
  const entrance = options.entrance ?? {
    x: playfield.width / 2 - (arch ? ARCH_SPAN / 2 : 0),
    y: playfield.height * 0.6,
  }
  const shape: Pick<NewShot, 'exit' | 'via'> = arch ? archFrom(entrance) : {}
  setShots(shots.length, {
    ...shotDefaults(entrance),
    name: `Shot ${id}`,
    ...shape,
    ...options,
    id,
    horseshoe: { ...(options.horseshoe ?? DEFAULT_HORSESHOE) },
    exitOrigin: { ...(options.exitOrigin ?? DEFAULT_ORIGIN) },
    via: (options.via ?? shape.via ?? []).map((p) => ({ id: nextViaId++, x: p.x, y: p.y, weight: 1 })),
    mounts: { left: defaultMounts(() => nextMountId++), right: defaultMounts(() => nextMountId++) },
  })
  setSelectedId(id)
  return id
}

// Start with a shot so there's something to look at.
addShot({
  entrance: { x: 17.1875, y: 28.5 },
  entranceWidth: 2.75,
  exit: { x: 9.375, y: 43.1875, angle: -179 },
  exitWidth: 2,
  exitWeight: 1.15,
  entranceOffset: 0.40625,
})

export function removeShot(id: number) {
  // A shot it fed is shot from the flippers again.
  stopFeeding(id)
  setShots((list) => list.filter((shot) => shot.id !== id))
  unfocus('shot', id)
}

export function renameShot(id: number, name: string) {
  setShots((shot) => shot.id === id, 'name', name)
}

export function setEntrance(id: number, entrance: Partial<Entrance>) {
  setShots((shot) => shot.id === id, 'entrance', entrance)
}

export function setExit(id: number, exit: Partial<Exit>) {
  setShots((shot) => shot.id === id, 'exit', exit)
}

// What kind of lane a shot is: shot into at its entrance and left by its exit,
// shot into at either end and left by the other, or a ramp, which rises off
// the playfield and is always single-ended.
export type ShotType = 'single' | 'double' | 'ramp'

export const shotType = (shot: Shot): ShotType => (shot.ramp ? 'ramp' : shot.end === 'double' ? 'double' : 'single')

/** Make a shot single-ended, double-ended or a ramp. A double-ended lane made single-ended is left open. */
export function setShotType(id: number, type: ShotType) {
  const shot = shots.find((s) => s.id === id)
  if (!shot || shotType(shot) === type) return
  batch(() => {
    setShots((s) => s.id === id, 'ramp', type === 'ramp')
    if (type === 'double') setLaneEnd(id, 'double')
    else if (shot.end === 'double') setLaneEnd(id, 'open')
  })
}

/** End a lane open, in a horseshoe, or in a second entrance. */
export function setLaneEnd(id: number, end: LaneEnd) {
  batch(() => {
    // A horseshoe turns the ball away from the lane it fed.
    if (end === 'horseshoe') stopFeeding(id, 'exit')
    // Only a double-ended lane is left by its entrance, or fed at its exit.
    if (end !== 'double') {
      stopFeeding(id, 'entrance')
      setShots((shot) => shot.id === id, 'exitOrigin', 'feed', null)
    }
    setShots((shot) => shot.id === id, 'end', end)
  })
}

export function setHorseshoe(id: number, changes: Partial<Horseshoe>) {
  setShots((shot) => shot.id === id, 'horseshoe', changes)
}

/**
 * Offset from a shot's exit to the center of its horseshoe: a radius to
 * the side the horseshoe turns toward.
 */
const horseshoeOffset = (shot: Shot) => {
  const angle = (shot.exit.angle * Math.PI) / 180
  // Left of the exit direction for a left turn, right for a right one.
  const side = shot.horseshoe.rotation >= 0 ? 1 : -1
  return { x: -Math.sin(angle) * side * shot.horseshoe.radius, y: Math.cos(angle) * side * shot.horseshoe.radius }
}

/** Center of a shot's horseshoe, in playfield coordinates. */
export function horseshoeCenter(shot: Shot): Entrance {
  const offset = horseshoeOffset(shot)
  return { x: shot.exit.x + offset.x, y: shot.exit.y + offset.y }
}

/** Where a shot's exit goes to put its horseshoe's center at `center`. */
export function exitForHorseshoe(shot: Shot, center: Entrance): Entrance {
  const offset = horseshoeOffset(shot)
  return { x: center.x - offset.x, y: center.y - offset.y }
}

// A shot the ball runs through on its way to another: it comes in by one
// end and leaves by `leaves`.
export type Leg = { shot: Shot; leaves: ShotEnd }

/**
 * The lanes feeding one end of `shot`, from the one shot off the flippers
 * on to the one the ball leaves into this end. Empty if that end isn't fed,
 * or if its feeders are missing, can't be left by the end feeding, or loop
 * back on themselves, when it's shot off the flippers.
 */
export function feedChain(shot: Shot, end: ShotEnd = 'entrance'): Leg[] {
  const chain: Leg[] = []
  let feed = originOf(shot, end).feed
  while (feed !== null) {
    const { id, end: leaves } = feed
    const from = shots.find((s) => s.id === id)
    if (!from || from.id === shot.id || chain.some((l) => l.shot.id === id) || !canLeaveBy(from, leaves)) return []
    chain.unshift({ shot: from, leaves })
    // The ball came into it by its other end.
    feed = originOf(from, otherEnd(leaves)).feed
  }
  return chain
}

const sameFeed = (a: Feed | null, b: Feed) => a !== null && a.id === b.id && a.end === b.end

/** The shot ends `feed` leads into. */
export const fedBy = (feed: Feed) =>
  shots.flatMap((s) =>
    shotEnds(s).flatMap((end) => (s.id !== feed.id && sameFeed(originOf(s, end).feed, feed) ? [{ shot: s, end }] : [])),
  )

/** Whether feeding shot `id` from `feed` would bring the ball back through `id`, or can't be done. */
export function feedLoops(id: number, feed: Feed) {
  const feeder = shots.find((s) => s.id === feed.id)
  if (!feeder || feed.id === id) return true
  return feedChain(feeder, otherEnd(feed.end)).some((l) => l.shot.id === id)
}

/**
 * Have the ball come into one end of shot `id` out of another lane's end, or
 * with null shoot it there off the flippers again. The feeding lane stops
 * feeding any other from that end, and is left open if it ended in a
 * horseshoe. Ignored if it would make a loop, or the feeding lane can't be
 * left by that end.
 */
export function setFeed(id: number, end: ShotEnd, feed: Feed | null) {
  if (feed !== null) {
    const feeder = shots.find((s) => s.id === feed.id)
    if (!feeder || feedLoops(id, feed) || (feed.end === 'entrance' && feeder.end !== 'double')) return
  }
  batch(() => {
    if (feed !== null) {
      stopFeeding(feed.id, feed.end)
      setShots((shot) => shot.id === feed.id && shot.end === 'horseshoe', 'end', 'open')
    }
    if (end === 'entrance') setShots((shot) => shot.id === id, 'feed', feed)
    else setShots((shot) => shot.id === id, 'exitOrigin', 'feed', feed)
  })
}

/** Shoot whatever `id` feeds from `end`, or from either end, off the flippers instead. */
function stopFeeding(id: number, end?: ShotEnd) {
  const fed = (f: Feed | null) => f !== null && f.id === id && (end === undefined || f.end === end)
  setShots((shot) => fed(shot.feed), 'feed', null)
  setShots((shot) => fed(shot.exitOrigin.feed), 'exitOrigin', 'feed', null)
}

/** Change the ball path one end of a shot is lined up with. */
export function setOrigin(id: number, end: ShotEnd, changes: Partial<Pick<Origin, 'flipper' | 'ballState' | 'split'>>) {
  if (end === 'entrance') setShots((shot) => shot.id === id, changes)
  else setShots((shot) => shot.id === id, 'exitOrigin', changes)
}

export function updateShot(
  id: number,
  changes: Partial<
    Pick<
      Shot,
      | 'entranceWidth'
      | 'exitWidth'
      | 'continuity'
      | 'flipper'
      | 'ballState'
      | 'entranceWeight'
      | 'exitWeight'
      | 'entranceOffset'
      | 'entrancePivot'
      | 'leadIn'
      | 'exitOffset'
      | 'exitPivot'
      | 'exitLeadIn'
      | 'funnelLength'
    >
  >,
) {
  setShots((shot) => shot.id === id, changes)
}

/** Insert a via point at `index` among the shot's via points. */
export function addVia(id: number, index: number, at: Entrance) {
  setShots((s) => s.id === id, 'via', (list) => [...list.slice(0, index), { id: nextViaId++, ...at, weight: 1 }, ...list.slice(index)])
}

export function moveVia(id: number, viaId: number, at: Partial<Omit<ViaPoint, 'id'>>) {
  setShots((s) => s.id === id, 'via', (v) => v.id === viaId, at)
}

export function removeVia(id: number, viaId: number) {
  unfocusPart('shot', id, viaId)
  setShots((s) => s.id === id, 'via', (list) => list.filter((v) => v.id !== viaId))
}

/** Put walls back along an open span, by its position among the shot's spans. */
export function removeOpenSpan(id: number, index: number) {
  setShots((s) => s.id === id, 'openSpans', (list) => list.filter((_, i) => i !== index))
}

/** Add a spike in the middle of the widest gap between a wall's mounts. */
export function addMount(id: number, side: WallSide) {
  const shot = shots.find((s) => s.id === id)
  if (!shot) return
  const stops = [0, ...shot.mounts[side].map((m) => m.at).sort((a, b) => a - b), 1]
  let at = 0.5
  let gap = -1
  for (let i = 1; i < stops.length; i++) {
    if (stops[i] - stops[i - 1] > gap) {
      gap = stops[i] - stops[i - 1]
      at = (stops[i] + stops[i - 1]) / 2
    }
  }
  setShots((s) => s.id === id, 'mounts', side, (list) => [...list, { id: nextMountId++, kind: 'spike' as const, at }])
}

export function updateMount(id: number, side: WallSide, mountId: number, changes: Partial<Omit<WallMount, 'id'>>) {
  setShots((s) => s.id === id, 'mounts', side, (m) => m.id === mountId, changes)
}

export const newMount = (kind: MountKind, at: number): WallMount => ({ id: nextMountId++, kind, at })

export function setMounts(id: number, side: WallSide, mounts: WallMount[]) {
  setShots((s) => s.id === id, 'mounts', side, mounts)
}

export function removeMount(id: number, side: WallSide, mountId: number) {
  setShots((s) => s.id === id, 'mounts', side, (list) => list.filter((m) => m.id !== mountId))
}

/** Swap in a whole new set of shots, as from an imported file, and select the first. */
export function replaceShots(list: Shot[]) {
  const maxId = (ids: number[]) => ids.reduce((max, id) => Math.max(max, id), 0)
  // New shots, via points and mounts get ids clear of the imported ones.
  nextId = maxId(list.map((s) => s.id)) + 1
  nextViaId = maxId(list.flatMap((s) => s.via.map((v) => v.id))) + 1
  nextMountId = maxId(list.flatMap((s) => [...s.mounts.left, ...s.mounts.right].map((m) => m.id))) + 1
  batch(() => {
    setShots(list)
    if (list[0]) focusOn('shot', list[0].id)
    else unfocus('shot')
  })
}

export { shots }
