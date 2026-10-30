import { createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { addShot, setSelectedId, shots } from './shots'
import { suggestMounts } from './mountSuggestions'
import { log } from './log'
import { fitSketch, joinStrokes } from './sketchFit'
import type { Point } from '../geometry/flipper'

// Sketch mode: lanes drawn freehand over the playfield, one color per shot,
// then fitted with smooth lanes. Shots can't be edited meanwhile.

export const SKETCH_COLORS = [
  '#ff4d4d',
  '#ff9f1a',
  '#ffe14d',
  '#4cd964',
  '#2ee6d6',
  '#4d8dff',
  '#a66bff',
  '#ff66c4',
  '#f2f2f2',
]

const [sketching, setSketching] = createSignal(false)
// The color being drawn in, as an index into SKETCH_COLORS; null pans the view instead.
const [activeColor, setActiveColor] = createSignal<number | null>(null)
// Strokes drawn in each color, in SVG coordinates, in the order drawn.
const [strokes, setStrokes] = createStore<Point[][][]>(SKETCH_COLORS.map(() => []))
// Lane shapes tried so far out of the most that will be, while fitting.
const [fitting, setFitting] = createSignal<{ tried: number; most: number } | null>(null)
const clearStrokes = () => setStrokes(SKETCH_COLORS.map(() => []))

export function startSketch() {
  clearStrokes()
  setActiveColor(0)
  setSketching(true)
}

export function cancelSketch() {
  if (fitting()) return
  clearStrokes()
  setSketching(false)
}

/** Pick a color to draw in, or put down the one in hand to pan the view. */
export const chooseColor = (color: number) => setActiveColor((current) => (current === color ? null : color))

// Points closer than this to the last one in a stroke are skipped, inches.
const MIN_STEP = 0.05

export function beginStroke(color: number, p: Point) {
  setStrokes(color, strokes[color].length, [p])
}

/** Carry the latest stroke in a color on to `p`. */
export function extendStroke(color: number, p: Point) {
  const index = strokes[color].length - 1
  const stroke = strokes[color][index]
  if (!stroke) return
  const last = stroke[stroke.length - 1]
  if (Math.hypot(p.x - last.x, p.y - last.y) < MIN_STEP) return
  setStrokes(color, index, stroke.length, p)
}

/** Take back the last stroke drawn in a color. */
export function undoStroke(color: number) {
  setStrokes(color, (list) => list.slice(0, -1))
}

/**
 * Fit a shot to each color's strokes and add them, then leave sketch mode.
 * Leaves straight away if nothing was drawn.
 */
export async function finishSketch() {
  if (fitting()) return
  const drawn = strokes
    .map((list, color) => ({ color, points: joinStrokes(list.map((s) => [...s])) }))
    .filter((s) => s.points.length > 1)
  if (drawn.length === 0) {
    cancelSketch()
    return
  }
  setFitting({ tried: 0, most: 1 })
  try {
    const fits = await fitSketch(drawn, (tried, most) => setFitting({ tried, most }))
    let first: number | null = null
    for (const fit of fits) {
      const color = SKETCH_COLORS[fit.color]
      if (fit.shots.length === 0) {
        log(`Sketch: not added. ${fit.notes.join(' ')}`, color)
        continue
      }
      // A cut lane's pieces each feed the next.
      const ids: number[] = []
      for (const shot of fit.shots) ids.push(addShot({ ...shot, feed: ids.at(-1) ?? null }))
      first ??= ids[0]
      // Mounts from each shot's own hits, once the lanes feeding it are there.
      for (const id of ids) suggestMounts(id)
      const names = ids.map((id) => shots.find((s) => s.id === id)?.name ?? 'Shot')
      log([`Sketch: added ${names.join(', then ')}.`, ...fit.notes].join(' '), color)
    }
    if (first !== null) setSelectedId(first)
    clearStrokes()
    setSketching(false)
  } finally {
    setFitting(null)
  }
}

export { sketching, activeColor, strokes, fitting }
