import { createSignal } from 'solid-js'
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
}

export type ViaPoint = Entrance & { id: number }

const [shots, setShots] = createStore<Shot[]>([])

// The shot whose ball paths are shown on the playfield.
const [selectedId, setSelectedId] = createSignal<number | null>(null)

export const selectedShot = () => shots.find((shot) => shot.id === selectedId())

let nextId = 1
let nextMountId = 1

// Spade bolts near each end and a spike between.
const defaultMounts = (): WallMount[] => [
  { id: nextMountId++, kind: 'spade', at: 0.05 },
  { id: nextMountId++, kind: 'spike', at: 0.5 },
  { id: nextMountId++, kind: 'spade', at: 0.95 },
]

type NewShot = Partial<Pick<Shot, 'name' | 'entrance' | 'exit'>>

export function addShot(options: NewShot = {}) {
  const id = nextId++
  // Start somewhere in the upper playfield; the user will drag it into place.
  const entrance = options.entrance ?? { x: playfield.width / 2, y: playfield.height * 0.6 }
  setShots(shots.length, {
    id,
    name: options.name ?? `Shot ${id}`,
    entrance,
    entranceWidth: 2.5,
    exitWidth: 2.25,
    exit: options.exit ?? { x: entrance.x, y: entrance.y + 6, angle: 90 },
    continuity: 'g2',
    entranceWeight: 1,
    exitWeight: 1,
    alignment: 'cross-inlane',
    entranceOffset: 0,
    leadIn: 0,
    funnelLength: Infinity,
    via: [],
    mounts: { left: defaultMounts(), right: defaultMounts() },
  })
  setSelectedId(id)
}

// Start with a left orbit so there's something to look at: a lane up the
// left side of the playfield, fed by the right flipper.
addShot({
  name: 'Left orbit',
  entrance: { x: 3, y: 24 },
  exit: { x: 2.75, y: 36, angle: 90 },
})

export function removeShot(id: number) {
  const index = shots.findIndex((shot) => shot.id === id)
  setShots((list) => list.filter((shot) => shot.id !== id))
  if (selectedId() === id) {
    // Select the neighbor that slid into its place, or the new last shot.
    setSelectedId(shots[Math.min(index, shots.length - 1)]?.id ?? null)
  }
}

export function setEntrance(id: number, entrance: Partial<Entrance>) {
  setShots((shot) => shot.id === id, 'entrance', entrance)
}

export function setExit(id: number, exit: Partial<Exit>) {
  setShots((shot) => shot.id === id, 'exit', exit)
}

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
    >
  >,
) {
  setShots((shot) => shot.id === id, changes)
}

let nextViaId = 1

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

export { shots, selectedId, setSelectedId }
