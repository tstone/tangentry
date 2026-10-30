import { batch } from 'solid-js'
import { createStore } from 'solid-js/store'
import { playfield } from './playfield'
import { focusOn, focusedId, unfocus } from './focus'
import { canFeedFlipper, originOf, setOrigin, shots, type Entrance, type Feed, type FlipperKey, type ShotEnd } from './shots'
import type { CoilId, FlipperProfileId } from '../physics/drive'

// Flippers besides the main pair, each placed anywhere on the playfield.
// Each has its own coil; they share the main flippers' stroke and rubber
// friction. All dimensions are in inches, angles in degrees.
export type ExtraFlipper = {
  id: number
  name: string
  // Pivot center, measured from the left edge and up from the bottom lip.
  pivot: Entrance
  // Which way it's mounted: a left flipper points right, as the main left
  // one does, and swings counter-clockwise.
  side: 'left' | 'right'
  profile: FlipperProfileId
  // Resting angle of the center line below horizontal.
  restAngle: number
  // Speed of the ball rolling down the flipper's axis as it reaches the
  // base, in/s.
  entranceSpeed: number
  coil: CoilId
  // The lane end the ball comes out of onto this flipper, as an upper
  // flipper is fed from an orbit or ramp. While it holds, the flipper points
  // the way the ball leaves and takes the speed it leaves at, in place of
  // its own side, rest angle and entrance speed.
  feed: Feed | null
  // How far a fed flipper sits off the line the ball comes out of the lane
  // along, to the right of the way it heads, inches, within FEED_OFFSET_MAX.
  feedOffset: number
}

// Furthest a fed flipper can be moved off the ball's line, either way, inches.
export const FEED_OFFSET_MAX = 0.25

// About what the main inlanes deliver to the main flippers' bases.
export const DEFAULT_ENTRANCE_SPEED = 20

// The standard red coil.
export const DEFAULT_COIL: CoilId = 'FL-11630'

// Dragged and new pivots snap to this increment, like other handles.
export const PIVOT_SNAP = 1 / 16
const snap = (value: number) => Math.round(value / PIVOT_SNAP) * PIVOT_SNAP

const [extraFlippers, setExtraFlippers] = createStore<ExtraFlipper[]>([])

// The extra flipper in focus.
export const selectedFlipperId = () => focusedId('flipper')
export const setSelectedFlipperId = (id: number) => focusOn('flipper', id)

let nextId = 1

/** How an extra flipper's ball paths and lane alignments are told apart from the main pair's. */
export const extraFlipperKey = (id: number): FlipperKey => `extra${id}`

export function addExtraFlipper() {
  const id = nextId++
  setExtraFlippers(extraFlippers.length, {
    id,
    name: `Extra Flipper ${id}`,
    // Start in the middle of the playfield; the user will drag it into place.
    pivot: { x: snap(playfield.width / 2), y: snap(playfield.height / 2) },
    side: 'left',
    profile: 'modern-mini',
    restAngle: 30,
    entranceSpeed: DEFAULT_ENTRANCE_SPEED,
    coil: DEFAULT_COIL,
    feed: null,
    feedOffset: 0,
  })
  setSelectedFlipperId(id)
}

/** The lane end feeding an extra flipper, if that lane is still there and the ball can leave by that end. */
export function flipperFeed(f: ExtraFlipper): Feed | null {
  const feed = f.feed
  const from = feed && shots.find((s) => s.id === feed.id)
  return feed && from && canFeedFlipper(from, feed.end) ? feed : null
}

/** Shots made off a flipper that's gone go back to the automatic choice. */
function forgetMissingAlignments() {
  const present = new Set<FlipperKey>(extraFlippers.map((f) => extraFlipperKey(f.id)))
  for (const shot of shots) {
    for (const end of ['entrance', 'exit'] as ShotEnd[]) {
      const { flipper } = originOf(shot, end)
      if (flipper.startsWith('extra') && !present.has(flipper as FlipperKey)) setOrigin(shot.id, end, { flipper: 'auto' })
    }
  }
}

export function removeExtraFlipper(id: number) {
  batch(() => {
    setExtraFlippers((list) => list.filter((f) => f.id !== id))
    forgetMissingAlignments()
    unfocus('flipper', id)
  })
}

export function updateExtraFlipper(id: number, changes: Partial<Omit<ExtraFlipper, 'id'>>) {
  setExtraFlippers((f) => f.id === id, changes)
}

export function moveExtraFlipper(id: number, to: Entrance) {
  updateExtraFlipper(id, {
    pivot: {
      x: snap(Math.min(playfield.width, Math.max(0, to.x))),
      y: snap(Math.min(playfield.height, Math.max(0, to.y))),
    },
  })
}

/** Swap in a whole new set of extra flippers, as from an imported file. */
export function replaceExtraFlippers(list: ExtraFlipper[]) {
  // New flippers get ids clear of the imported ones.
  nextId = list.reduce((max, f) => Math.max(max, f.id), 0) + 1
  batch(() => {
    setExtraFlippers(list)
    forgetMissingAlignments()
    unfocus('flipper')
  })
}

export { extraFlippers }
