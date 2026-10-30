import { batch, createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { playfield } from './playfield'
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

// Which solved ball path the lane's entrance is lined up with, as
// `${approach}-${ballState}`.
export type LaneAlignment = 'cross-inlane' | 'cross-cradle' | 'backhand-inlane' | 'backhand-cradle'

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
  alignment: LaneAlignment
  // How far the lane's center sits from the ball where it enters, inches.
  // Positive puts the ball nearer the right wall.
  entranceOffset: number
  // Straight run before the lane starts to bend, inches.
  leadIn: number
  // Distance from the entrance over which the lane narrows to the exit
  // width, inches. Infinity spreads it over the whole lane.
  funnelLength: number
  // Points between the entrance and exit the lane passes through, in order,
  // for shapes a single bend can't make.
  via: ViaPoint[]
  mounts: Record<WallSide, WallMount[]>
  // Shot whose exit this one's is joined to, making the two lanes one, as
  // an orbit is: a ball shot into either comes out of the other's entrance.
  // Joined exits share a point and width and point opposite ways.
  link: number | null
  // Shot whose exit feeds this one's entrance: the ball leaves that lane,
  // crosses open playfield and comes into this one, as where a lane is cut
  // to leave room for balls on their way to other shots. A fed shot isn't
  // shot from the flippers; its ball comes through the lanes feeding it.
  feed: number | null
  // What the lane does past its exit when it isn't joined to another.
  end: LaneEnd
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
// circular turn from there, keeping the exit width.
export type LaneEnd = 'open' | 'horseshoe'

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

export type ViaPoint = Entrance & { id: number }

const [shots, setShots] = createStore<Shot[]>([])

// The shot whose ball paths are shown on the playfield.
const [selectedId, setSelected] = createSignal<number | null>(null)

// The shot last picked out by the user, as by clicking or adding it. Not
// changed when the selection only moves on from a removed or replaced shot.
const [pickedId, setPickedId] = createSignal<number | null>(null, { equals: false })

/** Select a shot the user picked out. */
export function setSelectedId(id: number | null) {
  if (id !== null && id !== selectedId()) setPickedId(id)
  setSelected(id)
}

export { pickedId }

export const selectedShot = () => shots.find((shot) => shot.id === selectedId())

let nextId = 1
let nextMountId = 1
let nextViaId = 1

export const DEFAULT_HORSESHOE: Horseshoe = { rotation: 180, radius: 2.5 }

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
  alignment: 'cross-inlane',
  ramp: false,
  entranceOffset: 0,
  leadIn: 0,
  funnelLength: Infinity,
  via: [],
  mounts: { left: defaultMounts(() => -1), right: defaultMounts(() => -1) },
  link: null,
  feed: null,
  end: 'open',
  horseshoe: { ...DEFAULT_HORSESHOE },
  openSpans: [],
})

type NewShot = Partial<Omit<Shot, 'id' | 'via' | 'mounts' | 'link'>> & { via?: Entrance[] }

/** Add a shot and select it, returning its id. */
export function addShot(options: NewShot = {}) {
  const id = nextId++
  // Start somewhere in the upper playfield; the user will drag it into place.
  const entrance = options.entrance ?? { x: playfield.width / 2, y: playfield.height * 0.6 }
  setShots(shots.length, {
    ...shotDefaults(entrance),
    name: `Shot ${id}`,
    ...options,
    id,
    horseshoe: { ...(options.horseshoe ?? DEFAULT_HORSESHOE) },
    via: (options.via ?? []).map((p) => ({ id: nextViaId++, x: p.x, y: p.y })),
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
  const index = shots.findIndex((shot) => shot.id === id)
  unlinkShot(id)
  // A shot it fed is shot from the flippers again.
  stopFeeding(id)
  setShots((list) => list.filter((shot) => shot.id !== id))
  if (selectedId() === id) {
    // Select the neighbor that slid into its place, or the new last shot.
    setSelected(shots[Math.min(index, shots.length - 1)]?.id ?? null)
  }
}

export function renameShot(id: number, name: string) {
  setShots((shot) => shot.id === id, 'name', name)
}

export function setEntrance(id: number, entrance: Partial<Entrance>) {
  setShots((shot) => shot.id === id, 'entrance', entrance)
}

const linkOf = (id: number) => shots.find((shot) => shot.id === id)?.link ?? null

/** The direction pointing the other way, within ±180°. */
const opposite = (angle: number) => (angle > 0 ? angle - 180 : angle + 180)

/** Move a shot's exit, and the exit joined to it along with it. */
export function setExit(id: number, exit: Partial<Exit>) {
  const link = linkOf(id)
  batch(() => {
    setShots((shot) => shot.id === id, 'exit', exit)
    if (link === null) return
    const { angle, ...at } = exit
    setShots((shot) => shot.id === link, 'exit', angle === undefined ? at : { ...at, angle: opposite(angle) })
  })
}

/**
 * Join shot `id`'s exit to `to`'s, so the two lanes run as one. The lane
 * being joined on moves its exit to the other's, keeping that one in place.
 */
export function linkShots(id: number, to: number) {
  const target = shots.find((shot) => shot.id === to)
  if (!target || id === to) return
  batch(() => {
    unlinkShot(id)
    unlinkShot(to)
    // Joined exits lead into each other, not on to another lane.
    stopFeeding(id)
    stopFeeding(to)
    setShots((shot) => shot.id === id, {
      exit: { x: target.exit.x, y: target.exit.y, angle: opposite(target.exit.angle) },
      exitWidth: target.exitWidth,
      link: to,
      end: 'open',
    })
    setShots((shot) => shot.id === to, { link: id, end: 'open' })
  })
}

/** End a lane open or in a horseshoe, separating it from any lane joined to it. */
export function setLaneEnd(id: number, end: LaneEnd) {
  batch(() => {
    unlinkShot(id)
    // A horseshoe turns the ball away from the lane it fed.
    if (end === 'horseshoe') stopFeeding(id)
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

/** Separate a shot's lane from the one it's joined to, leaving both where they are. */
export function unlinkShot(id: number) {
  setShots((shot) => shot.id === id || shot.link === id, 'link', null)
}

/**
 * The shots feeding `shot`, from the one shot off the flippers on to the one
 * whose exit leads into it. Empty if it isn't fed, or if its feeders are
 * missing or loop back on themselves, when it's shot off the flippers.
 */
export function feedChain(shot: Shot): Shot[] {
  const chain: Shot[] = []
  let at = shot
  while (at.feed !== null) {
    const from = shots.find((s) => s.id === at.feed)
    if (!from || from.id === shot.id || chain.some((s) => s.id === from.id)) return []
    chain.unshift(from)
    at = from
  }
  return chain
}

/** The shot whose entrance `id`'s exit leads into, if any. */
export const fedBy = (id: number) => shots.find((s) => s.feed === id && s.id !== id)

/**
 * Have shot `from`'s exit lead into `id`'s entrance, or with null shoot `id`
 * off the flippers again. The feeding lane is left open at its exit, and
 * stops feeding any other. Ignored if it would make a loop.
 */
export function setFeed(id: number, from: number | null) {
  if (from !== null) {
    const feeder = shots.find((s) => s.id === from)
    if (!feeder || from === id || feedChain(feeder).some((s) => s.id === id)) return
  }
  batch(() => {
    if (from !== null) {
      unlinkShot(from)
      stopFeeding(from)
      setShots((shot) => shot.id === from, 'end', 'open')
    }
    setShots((shot) => shot.id === id, 'feed', from)
  })
}

/** Shoot the shot `id` feeds, if any, off the flippers instead. */
const stopFeeding = (id: number) => setShots((shot) => shot.feed === id, 'feed', null)

export function updateShot(
  id: number,
  changes: Partial<
    Pick<
      Shot,
      | 'entranceWidth'
      | 'exitWidth'
      | 'continuity'
      | 'alignment'
      | 'entranceWeight'
      | 'exitWeight'
      | 'entranceOffset'
      | 'leadIn'
      | 'funnelLength'
      | 'ramp'
    >
  >,
) {
  const link = linkOf(id)
  batch(() => {
    setShots((shot) => shot.id === id, changes)
    // Joined lanes meet at one width.
    if (link !== null && changes.exitWidth !== undefined) {
      setShots((shot) => shot.id === link, 'exitWidth', changes.exitWidth)
    }
  })
}

/** Insert a via point at `index` among the shot's via points. */
export function addVia(id: number, index: number, at: Entrance) {
  setShots((s) => s.id === id, 'via', (list) => [...list.slice(0, index), { id: nextViaId++, ...at }, ...list.slice(index)])
}

export function moveVia(id: number, viaId: number, at: Partial<Entrance>) {
  setShots((s) => s.id === id, 'via', (v) => v.id === viaId, at)
}

export function removeVia(id: number, viaId: number) {
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
    setSelected(list[0]?.id ?? null)
  })
}

export { shots, selectedId }
