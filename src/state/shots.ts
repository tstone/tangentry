import { createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { playfield } from './playfield'
import type { Continuity } from '../geometry/lane'

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
}

const [shots, setShots] = createStore<Shot[]>([])

// The shot whose ball paths are shown on the playfield.
const [selectedId, setSelectedId] = createSignal<number | null>(null)

export const selectedShot = () => shots.find((shot) => shot.id === selectedId())

let nextId = 1

export function addShot() {
  const id = nextId++
  // Start somewhere in the upper playfield; the user will drag it into place.
  const entrance = { x: playfield.width / 2, y: playfield.height * 0.6 }
  setShots(shots.length, {
    id,
    name: `Shot ${id}`,
    entrance,
    entranceWidth: 2.5,
    exitWidth: 2.25,
    exit: { x: entrance.x, y: entrance.y + 6, angle: 90 },
    continuity: 'g2',
    entranceWeight: 1,
    exitWeight: 1,
    alignment: 'cross-inlane',
  })
  setSelectedId(id)
}

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
    Pick<Shot, 'entranceWidth' | 'exitWidth' | 'continuity' | 'alignment' | 'entranceWeight' | 'exitWeight'>
  >,
) {
  setShots((shot) => shot.id === id, changes)
}

export { shots, selectedId, setSelectedId }
