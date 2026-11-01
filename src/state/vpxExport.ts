import { playfield } from './playfield'
import { flippers, flipperShape, profile } from './flippers'
import { shots } from './shots'
import { computeLayout } from './layout'
import { shotAnalyses, type Lane } from './solutions'
import type { Point } from '../geometry/flipper'
import {
  ITEM_FLIPPER,
  ITEM_RAMP,
  float,
  int,
  itemName,
  readFloat,
  readString,
  readTable,
  recordData,
  setRecord,
  string,
  vec2,
  wideString,
  writeTable,
  type BiffRecord,
  type GameItem,
} from '../vpx/table'

// A Visual Pinball X table: the lanes and flippers set up here, written
// into a table the user picks. Each lane becomes flat ramps at playfield
// level, whose walls guide the ball as lane walls do. The table's
// LeftFlipper and RightFlipper are moved and sized to match.

// Visual Pinball units: a ball is 50 across, and 1-1/16″.
const VPU_PER_INCH = 50 / 1.0625

// Layer the lanes go on. Ramps on it are replaced on the next export into the same table.
const LANE_LAYER = 'Tangentry lanes'

// Height of lane walls: what the ball hits, and what's drawn.
const WALL_HEIGHT = 62
const VISIBLE_WALL_HEIGHT = 30

// How far a ramp's straight-line width may stray from the lane's, and its
// center line from the lane's, inches.
const WIDTH_TOLERANCE = 0.01
const CURVE_TOLERANCE = 0.005

// Friction of Visual Pinball's playfield, for a table that doesn't say.
const DEFAULT_FRICTION = 0.075

// Item names are at most 31 characters, and used as names in the table script.
const MAX_NAME = 31

// Solved geometry is in SVG coordinates, inches with y down from the top,
// as Visual Pinball's are.
const vpx = (p: Point): Point => ({ x: p.x * VPU_PER_INCH, y: p.y * VPU_PER_INCH })

/** Indexes of the points of `points` from `first` to `last` within `tolerance` of a line through all of them. */
function simplify(points: Point[], first: number, last: number, tolerance: number): number[] {
  const a = points[first]
  const b = points[last]
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
  let farthest = -1
  let distance = tolerance
  for (let i = first + 1; i < last; i++) {
    const d = Math.abs((b.x - a.x) * (a.y - points[i].y) - (a.x - points[i].x) * (b.y - a.y)) / length
    if (d > distance) {
      distance = d
      farthest = i
    }
  }
  if (farthest < 0) return [first, last]
  return [...simplify(points, first, farthest, tolerance), ...simplify(points, farthest, last, tolerance).slice(1)]
}

type RampPiece = { points: Point[]; widths: [number, number]; left: boolean; right: boolean }

/**
 * A lane as ramps: one for each stretch with the same walls standing, split
 * further where its width doesn't change evenly, since a ramp's width runs
 * in a straight line from one end to the other.
 */
function lanePieces(lane: Lane): RampPiece[] {
  const { center, widths } = lane
  const left = lane.walls.find((w) => w.side === 'left')!
  const right = lane.walls.find((w) => w.side === 'right')!
  // Which walls stand between each sample and the next.
  const standing = (i: number) => ({
    left: !left.open[i] && !left.open[i + 1],
    right: !right.open[i] && !right.open[i + 1],
  })

  const points = center.map((q) => q.p)
  const pieces: RampPiece[] = []
  const add = (first: number, last: number, walls: { left: boolean; right: boolean }) => {
    pieces.push({
      points: simplify(points, first, last, CURVE_TOLERANCE).map((i) => vpx(points[i])),
      widths: [widths[first] * VPU_PER_INCH, widths[last] * VPU_PER_INCH],
      ...walls,
    })
  }
  // Whether the width from `first` to `last` stays close to a straight run between its ends.
  const even = (first: number, last: number) => {
    const length = center[last].s - center[first].s || 1
    for (let i = first + 1; i < last; i++) {
      const f = (center[i].s - center[first].s) / length
      if (Math.abs(widths[first] + f * (widths[last] - widths[first]) - widths[i]) > WIDTH_TOLERANCE) return false
    }
    return true
  }

  let start = 0
  for (let i = 1; i < center.length; i++) {
    const walls = standing(start)
    const ends = i === center.length - 1 || standing(i).left !== walls.left || standing(i).right !== walls.right
    if (!ends) continue
    if (walls.left || walls.right) {
      // Split where the width bends.
      let first = start
      for (let last = first + 1; last <= i; last++) {
        if (last > first + 1 && !even(first, last)) {
          add(first, last - 1, walls)
          first = last - 1
        }
      }
      add(first, i, walls)
    }
    start = i
  }
  return pieces
}

/** A name for an item, unique in the table, made of letters, digits and underscores. */
function uniqueName(base: string, taken: Set<string>) {
  const clean = base.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^(?=\d)/, '_')
  let name = clean.slice(0, MAX_NAME)
  for (let n = 2; taken.has(name.toLowerCase()); n++) {
    const suffix = `_${n}`
    name = clean.slice(0, MAX_NAME - suffix.length) + suffix
  }
  taken.add(name.toLowerCase())
  return name
}

function ramp(name: string, piece: RampPiece, friction: number): GameItem {
  const wall = (standing: boolean, height: number) => float(standing ? height : 0)
  const rec = (tag: string, data: Uint8Array): BiffRecord => ({ tag, data })
  const empty = new Uint8Array()
  return {
    type: ITEM_RAMP,
    records: [
      rec('HTBT', float(0)),
      rec('HTTP', float(0)),
      rec('WDBT', float(piece.widths[0])),
      rec('WDTP', float(piece.widths[1])),
      rec('MATR', string('')),
      rec('TMON', int(0)),
      rec('TMIN', int(100)),
      // Flat.
      rec('TYPE', int(0)),
      rec('NAME', wideString(name)),
      rec('IMAG', string('')),
      rec('ALGN', int(0)),
      rec('IMGW', int(1)),
      rec('WLHL', wall(piece.left, WALL_HEIGHT)),
      rec('WLHR', wall(piece.right, WALL_HEIGHT)),
      rec('WVHL', wall(piece.left, VISIBLE_WALL_HEIGHT)),
      rec('WVHR', wall(piece.right, VISIBLE_WALL_HEIGHT)),
      rec('HTEV', int(0)),
      rec('THRS', float(2)),
      rec('ELAS', float(0.3)),
      // The ball rolls on the ramp's floor in the lane: as it does on the playfield.
      rec('RFCT', float(friction)),
      rec('RSCT', float(0)),
      rec('CLDR', int(1)),
      rec('RVIS', int(1)),
      rec('REEN', int(1)),
      rec('MAPH', int(0)),
      rec('OVPH', int(1)),
      rec('LOCK', int(0)),
      rec('LAYR', int(0)),
      rec('LANR', string(LANE_LAYER)),
      rec('LVIS', int(1)),
      rec('PNTS', empty),
      ...piece.points.flatMap((p) => [
        rec('DPNT', empty),
        rec('VCEN', vec2(p.x, p.y)),
        rec('POSZ', float(0)),
        // Sharp corners: the points are close enough to follow the curve.
        rec('SMTH', int(0)),
        rec('SLNG', int(0)),
        rec('ATEX', int(1)),
        rec('TEXC', float(0)),
        rec('LOCK', int(0)),
        rec('LAYR', int(0)),
        rec('LANR', int(0)),
        rec('LVIS', int(1)),
        rec('ENDB', empty),
      ]),
      rec('ENDB', empty),
    ],
  }
}

const onLaneLayer = (item: GameItem) => {
  const layer = recordData(item.records, 'LANR')
  return item.type === ITEM_RAMP && !!layer && readString(layer) === LANE_LAYER
}

/** Visual Pinball's angle, degrees clockwise from up the table, for a direction in SVG coordinates. */
const vpxAngle = (radians: number) => (Math.atan2(Math.cos(radians), -Math.sin(radians)) * 180) / Math.PI

/** Move and size the table's main flippers. Returns the names of any it doesn't have. */
function placeFlippers(items: GameItem[]): string[] {
  const shape = flipperShape(profile())
  return computeLayout().flippers.flatMap((f) => {
    const name = f.side === 'left' ? 'LeftFlipper' : 'RightFlipper'
    const item = items.find((i) => i.type === ITEM_FLIPPER && itemName(i).toLowerCase() === name.toLowerCase())
    if (!item) return [name]
    const start = vpxAngle(f.angle)
    // Up is counter-clockwise for the left flipper, clockwise for the right.
    const end = start + (f.side === 'left' ? -1 : 1) * flippers.strokeAngle
    const pivot = vpx(f.pivot)
    const rubber = profile().rubberThickness * VPU_PER_INCH
    setRecord(item.records, 'VCEN', vec2(pivot.x, pivot.y))
    setRecord(item.records, 'BASR', float(shape.baseRadius * VPU_PER_INCH))
    setRecord(item.records, 'ENDR', float(shape.tipRadius * VPU_PER_INCH))
    setRecord(item.records, 'FLPR', float(shape.length * VPU_PER_INCH))
    setRecord(item.records, 'ANGS', float(start))
    setRecord(item.records, 'ANGE', float(end))
    setRecord(item.records, 'RTHF', float(rubber))
    setRecord(item.records, 'RTHK', int(Math.round(rubber)))
    return []
  })
}

export type VpxExport = { file: Uint8Array; notes: string[] }

/**
 * The table in `base` with the lanes and flippers set up here, and resized
 * and tilted to the playfield. Throws if `base` isn't a table. Reads the stores.
 */
export function exportVpx(base: Uint8Array): VpxExport {
  const table = readTable(base)
  const notes: string[] = []
  const { gameData } = table

  setRecord(gameData, 'RGHT', float(playfield.width * VPU_PER_INCH))
  setRecord(gameData, 'BOTM', float(playfield.height * VPU_PER_INCH))
  // Slope at the least and most difficulty.
  setRecord(gameData, 'SLPX', float(playfield.angle))
  setRecord(gameData, 'SLOP', float(playfield.angle))

  const items = table.items.filter((item) => !onLaneLayer(item))
  const taken = new Set(items.map((item) => itemName(item).toLowerCase()))
  const playfieldFriction = recordData(gameData, 'FRCT')
  const friction = playfieldFriction ? readFloat(playfieldFriction) : DEFAULT_FRICTION
  let skipped = 0
  for (const { id, lane } of shotAnalyses()) {
    const shot = shots.find((s) => s.id === id)
    if (!lane || !shot) continue
    // A ramp rises off the playfield, which a flat lane can't.
    if (shot.ramp) {
      skipped++
      continue
    }
    for (const piece of lanePieces(lane)) items.push(ramp(uniqueName(`Lane_${shot.name}`, taken), piece, friction))
  }
  if (skipped) notes.push(`Left out ${skipped} ramp${skipped === 1 ? '' : 's'}: only lanes on the playfield are exported.`)

  const missing = placeFlippers(items)
  if (missing.length) notes.push(`The table has no ${missing.join(' or ')} to place.`)

  return { file: writeTable({ ...table, items }), notes }
}
