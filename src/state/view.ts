import { createMemo, createRoot, createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { selectedSolutions, type Approach, type BallState, type Solution } from './solutions'

// What the shot paths are colored by:
// - origin: how the ball arrived on the flipper (inlane or cradle)
// - smoothness: how cleanly the ball gets through the lane
// - speed: the ball's speed along its path
export type PathColoring = 'origin' | 'smoothness' | 'speed'

export const PATH_COLORINGS: { label: string; value: PathColoring }[] = [
  { label: 'Origin', value: 'origin' },
  { label: 'Smoothness', value: 'smoothness' },
  { label: 'Speed', value: 'speed' },
]

const [pathColoring, setPathColoring] = createSignal<PathColoring>('smoothness')

// Things drawn on the preview that can be hidden.
export type Layer = 'safeTravel' | 'paths' | 'walls' | 'reserved'

export const LAYERS: { layer: Layer; label: string }[] = [
  { layer: 'safeTravel', label: 'Safe passage region' },
  { layer: 'paths', label: 'Ball path' },
  { layer: 'walls', label: 'Walls' },
  { layer: 'reserved', label: 'Custom mechs' },
]

const [visible, setVisible] = createStore<Record<Layer, boolean>>({
  safeTravel: true,
  paths: true,
  walls: true,
  reserved: true,
})

export const showLayer = (layer: Layer, shown: boolean) => setVisible(layer, shown)

// The path hovered in the shot list, which is called out on the playfield.
export type PathKey = { approach: Approach; state: BallState }
const [hoveredPath, setHoveredPath] = createSignal<PathKey | null>(null)

export const isHovered = (approach: Approach, state: BallState) => {
  const hovered = hoveredPath()
  return hovered !== null && hovered.approach === approach && hovered.state === state
}

// An unselected shot under the mouse on the playfield, which a click would select.
const [hoveredShot, setHoveredShot] = createSignal<number | null>(null)
export { hoveredShot, setHoveredShot }

// A reserved area under the mouse on the playfield, which a click would select.
const [hoveredReserved, setHoveredReserved] = createSignal<number | null>(null)
export { hoveredReserved, setHoveredReserved }

/** Every speed along a solution's path, flipper to lane exit. */
export const pathSpeeds = (s: Solution) => [...s.rideSpeeds, ...s.flightSpeeds, ...(s.lane?.speeds ?? [])]

// Speeds across all of the selected shot's paths, so they share one scale.
export const speedRange = createRoot(() =>
  createMemo(() => {
    let min = Infinity
    let max = -Infinity
    for (const flipper of selectedSolutions()) {
      for (const s of Object.values(flipper.states)) {
        if (!s) continue
        for (const v of pathSpeeds(s)) {
          if (v < min) min = v
          if (v > max) max = v
        }
      }
    }
    return Number.isFinite(min) ? { min, max } : null
  }),
)

// Slowest to fastest.
export const SPEED_STOPS = ['#f5d76e', '#ffa45c', '#ff4d4d']

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

/** Color for a speed on the shared scale: yellow when slowest, red when fastest. */
export function speedColor(speed: number) {
  const range = speedRange()
  const f = range && range.max > range.min ? (speed - range.min) / (range.max - range.min) : 1
  const scaled = Math.min(1, Math.max(0, f)) * (SPEED_STOPS.length - 1)
  const i = Math.min(SPEED_STOPS.length - 2, Math.floor(scaled))
  const t = scaled - i
  const a = channels(SPEED_STOPS[i])
  const b = channels(SPEED_STOPS[i + 1])
  return `rgb(${a.map((c, k) => Math.round(c + (b[k] - c) * t)).join(', ')})`
}

/**
 * Class and inline style that set `--path-color` for a solution under the
 * current coloring. Speed coloring uses the departure speed for parts of the
 * path drawn in a single color.
 */
export function pathColor(state: BallState, s: Solution | null | undefined) {
  switch (pathColoring()) {
    case 'origin':
      return { class: `origin--${state}`, style: {} }
    case 'smoothness':
      return { class: `outcome--${s?.lane?.outcome ?? 'none'}`, style: {} }
    case 'speed':
      return { class: '', style: s ? { '--path-color': speedColor(s.speed) } : {} }
  }
}

export { visible, pathColoring, setPathColoring, hoveredPath, setHoveredPath }
