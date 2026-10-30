import { batch } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import { playfield } from './playfield'
import { focusOn, focusedId, unfocus } from './focus'
import type { Entrance } from './shots'
import type { Point } from '../geometry/flipper'
import { circleOverlapsPolygon, pathTouchesCircle, pathTouchesPolygon, polygonsOverlap } from '../geometry/overlap'

// Space set aside on the playfield for a mech, toy or other feature, so
// lanes can be laid out around it. All dimensions are in inches, positions
// measured from the left edge and up from the bottom lip.

export type ReservedPoint = Entrance & { id: number }

type ReservedBase = {
  id: number
  name: string
  // Something the player shoots at, so the ball needs a clear path to it
  // from the flippers.
  shootable: boolean
}

export type ReservedCircle = ReservedBase & {
  kind: 'circle'
  center: Entrance
  radius: number
}

export type ReservedPolygon = ReservedBase & {
  kind: 'polygon'
  // Corners in order around the outline.
  points: ReservedPoint[]
}

export type ReservedArea = ReservedCircle | ReservedPolygon

export type ReservedKind = ReservedArea['kind']

// A polygon needs at least this many corners to enclose anything.
export const MIN_POLYGON_POINTS = 3

// New corners snap to this increment, like dragged ones.
const SNAP = 1 / 16
const snap = (value: number) => Math.round(value / SNAP) * SNAP

const [reserved, setReserved] = createStore<ReservedArea[]>([])

// The custom mech in focus.
const selectedReservedId = () => focusedId('mech')
const setSelectedReservedId = (id: number) => focusOn('mech', id)

let nextId = 1
let nextPointId = 1

/** Middle of an area: a circle's center, or the average of a polygon's corners. */
export function areaCenter(area: ReservedArea): Entrance {
  if (area.kind === 'circle') return area.center
  const n = area.points.length || 1
  return {
    x: area.points.reduce((sum, p) => sum + p.x, 0) / n,
    y: area.points.reduce((sum, p) => sum + p.y, 0) / n,
  }
}

export function addReserved(kind: ReservedKind) {
  const id = nextId++
  const name = `Custom Mech ${id}`
  // Start in the middle of the playfield; the user will drag it into place.
  const c = { x: snap(playfield.width / 2), y: snap(playfield.height / 2) }
  setReserved(
    reserved.length,
    kind === 'circle'
      ? { id, name, shootable: true, kind, center: c, radius: 2 }
      : {
          id,
          name,
          shootable: true,
          kind,
          points: [
            { x: c.x - 2, y: c.y - 1.5 },
            { x: c.x + 2, y: c.y - 1.5 },
            { x: c.x + 2, y: c.y + 1.5 },
            { x: c.x - 2, y: c.y + 1.5 },
          ].map((p) => ({ id: nextPointId++, ...p })),
        },
  )
  setSelectedReservedId(id)
}

export function removeReserved(id: number) {
  setReserved((list) => list.filter((a) => a.id !== id))
  unfocus('mech', id)
}

// Change one area in place.
const edit = (id: number, change: (area: ReservedArea) => void) => setReserved((a) => a.id === id, produce(change))

export function renameReserved(id: number, name: string) {
  edit(id, (area) => {
    area.name = name
  })
}

export function setShootable(id: number, shootable: boolean) {
  edit(id, (area) => {
    area.shootable = shootable
  })
}

/** Move a whole area so its middle lands on `to`. */
export function moveReserved(id: number, to: Entrance) {
  edit(id, (area) => {
    const from = areaCenter(area)
    if (area.kind === 'circle') {
      area.center = { x: to.x, y: to.y }
      return
    }
    for (const p of area.points) {
      p.x += to.x - from.x
      p.y += to.y - from.y
    }
  })
}

export function setCircle(id: number, changes: Partial<Pick<ReservedCircle, 'center' | 'radius'>>) {
  edit(id, (area) => {
    if (area.kind === 'circle') Object.assign(area, changes)
  })
}

export function movePoint(id: number, pointId: number, at: Partial<Entrance>) {
  edit(id, (area) => {
    const point = area.kind === 'polygon' ? area.points.find((p) => p.id === pointId) : undefined
    if (point) Object.assign(point, at)
  })
}

/** Add a corner halfway along a polygon's longest side. */
export function insertPoint(id: number) {
  edit(id, (area) => {
    if (area.kind !== 'polygon' || area.points.length === 0) return
    const pts = area.points
    const sideLength = (i: number) => {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      return Math.hypot(b.x - a.x, b.y - a.y)
    }
    let longest = 0
    for (let i = 1; i < pts.length; i++) if (sideLength(i) > sideLength(longest)) longest = i
    const a = pts[longest]
    const b = pts[(longest + 1) % pts.length]
    pts.splice(longest + 1, 0, { id: nextPointId++, x: snap((a.x + b.x) / 2), y: snap((a.y + b.y) / 2) })
  })
}

export function removePoint(id: number, pointId: number) {
  edit(id, (area) => {
    if (area.kind !== 'polygon' || area.points.length <= MIN_POLYGON_POINTS) return
    area.points = area.points.filter((p) => p.id !== pointId)
  })
}

/**
 * Reserved areas a lane's outline runs into. The outline is in SVG
 * coordinates, as lane walls are: y measured down from the top.
 */
export function reservedCrossedBy(outline: Point[]): ReservedArea[] {
  const svg = (p: Entrance) => ({ x: p.x, y: playfield.height - p.y })
  return reserved.filter((area) =>
    area.kind === 'circle'
      ? circleOverlapsPolygon(svg(area.center), area.radius, outline)
      : polygonsOverlap(area.points.map(svg), outline),
  )
}

/**
 * The first reserved area a ball of `radius` rolling along `path` runs
 * into, or null. The path is in SVG coordinates.
 */
export function reservedBlocking(path: Point[], radius: number): ReservedArea | null {
  const svg = (p: Entrance) => ({ x: p.x, y: playfield.height - p.y })
  return (
    reserved.find((area) =>
      area.kind === 'circle'
        ? pathTouchesCircle(path, radius, svg(area.center), area.radius)
        : pathTouchesPolygon(path, radius, area.points.map(svg)),
    ) ?? null
  )
}

/** Swap in a whole new set of areas, as from an imported file. */
export function replaceReserved(list: ReservedArea[]) {
  const maxId = (ids: number[]) => ids.reduce((max, id) => Math.max(max, id), 0)
  // New areas and corners get ids clear of the imported ones.
  nextId = maxId(list.map((a) => a.id)) + 1
  nextPointId = maxId(list.flatMap((a) => (a.kind === 'polygon' ? a.points.map((p) => p.id) : []))) + 1
  batch(() => {
    setReserved(list)
    unfocus('mech')
  })
}

export { reserved, selectedReservedId, setSelectedReservedId }
