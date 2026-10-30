import { playfield } from './playfield'
import { flipperShape, profile } from './flippers'
import { extraFlippers } from './extraFlippers'
import { reserved } from './reserved'
import { computeLayout, extraFlipperLayout } from './layout'
import { BALL_STATES, resolvedExtraFlipper, shotAnalyses } from './solutions'
import { flipperProfile } from '../physics/drive'
import type { Point } from '../geometry/flipper'

// Line drawings of the playfield, to take into CAD or a drawing program: DXF
// or SVG, with each part on its own layer. Geometry is gathered once, in
// inches with y up the playfield from the bottom lip, and each format writes
// it out.

export type DrawingPart = 'playfield' | 'lanes' | 'laneCenters' | 'paths' | 'flippers' | 'mechs'

export const DRAWING_PARTS: { part: DrawingPart; label: string; note: string }[] = [
  { part: 'playfield', label: 'Playfield outline', note: 'The playfield’s edge and side rails.' },
  { part: 'lanes', label: 'Lanes', note: 'Every lane’s walls, broken at open spans.' },
  { part: 'laneCenters', label: 'Lane center lines', note: 'The line each lane is built around.' },
  { part: 'paths', label: 'Ball paths', note: 'Every solved ball path into every shot, off each flipper.' },
  { part: 'flippers', label: 'Flippers', note: 'The main pair and extra flippers at rest: rubber and bat outlines.' },
  { part: 'mechs', label: 'Custom mechs', note: 'The outline of each custom mech.' },
]

// Layer name, AutoCAD color index and SVG stroke for each part.
const LAYERS: Record<DrawingPart, { name: string; color: number; stroke: string }> = {
  playfield: { name: 'PLAYFIELD', color: 8, stroke: '#808080' },
  lanes: { name: 'LANES', color: 7, stroke: '#000000' },
  laneCenters: { name: 'LANE_CENTERS', color: 4, stroke: '#0099aa' },
  paths: { name: 'BALL_PATHS', color: 3, stroke: '#00a000' },
  flippers: { name: 'FLIPPERS', color: 1, stroke: '#e00000' },
  mechs: { name: 'MECHS', color: 6, stroke: '#b000b0' },
}

// SVG line width, inches.
const SVG_STROKE = 0.02

type Vertex = Point & { bulge?: number }

type Entity =
  | { kind: 'polyline'; vertices: Vertex[]; closed: boolean }
  | { kind: 'circle'; center: Point; radius: number }

// Solved geometry is in SVG coordinates, with y down from the top.
const fromSvg = (p: Point): Point => ({ x: p.x, y: playfield.height - p.y })

const polyline = (points: Point[], closed = false): Entity => ({ kind: 'polyline', vertices: points, closed })

/**
 * Outline of a flipper, as `flipperPath` draws it, in DXF coordinates: a base
 * circle and tip circle joined by their outer tangents. Arcs are bulges.
 */
function flipperOutline(svgBase: Point, R: number, r: number, length: number, svgAngle: number): Entity {
  const base = fromSvg(svgBase)
  const angle = -svgAngle
  const tip = { x: base.x + length * Math.cos(angle), y: base.y + length * Math.sin(angle) }
  if (length <= Math.abs(R - r)) return { kind: 'circle', center: R >= r ? base : tip, radius: Math.max(R, r) }
  const alpha = Math.acos((R - r) / length)
  const on = (c: Point, radius: number, a: number) => ({ x: c.x + radius * Math.cos(a), y: c.y + radius * Math.sin(a) })
  // Counter-clockwise round the tip through its far side, then round the base.
  return {
    kind: 'polyline',
    closed: true,
    vertices: [
      on(base, R, angle - alpha),
      { ...on(tip, r, angle - alpha), bulge: Math.tan(alpha / 2) },
      on(tip, r, angle + alpha),
      { ...on(base, R, angle + alpha), bulge: Math.tan((Math.PI - alpha) / 2) },
    ],
  }
}

function playfieldEntities(): Entity[] {
  const { width, height, sideRail } = playfield
  const rect = (x: number, w: number) =>
    polyline(
      [
        { x, y: 0 },
        { x: x + w, y: 0 },
        { x: x + w, y: height },
        { x, y: height },
      ],
      true,
    )
  return [rect(0, width), ...(sideRail > 0 ? [rect(0, sideRail), rect(width - sideRail, sideRail)] : [])]
}

function laneEntities(): Entity[] {
  return shotAnalyses().flatMap(({ lane }) =>
    lane
      ? lane.walls.flatMap((wall) =>
          lane.pieces.map(([first, last]) => polyline(wall.points.slice(first, last + 1).map(fromSvg))),
        )
      : [],
  )
}

function laneCenterEntities(): Entity[] {
  return shotAnalyses().flatMap(({ lane }) => (lane ? [polyline(lane.center.map((q) => fromSvg(q.p)))] : []))
}

function pathEntities(): Entity[] {
  const lines = shotAnalyses().flatMap((analysis) =>
    analysis.runs.flatMap((run) =>
      run.flippers.flatMap((flipper) =>
        BALL_STATES.flatMap(({ state }) => {
          const s = flipper.states[state]
          return s ? [s.ride, s.flight, ...(s.lane ? [s.lane.path] : [])] : []
        }),
      ),
    ),
  )
  return lines.filter((line) => line.length > 1).map((line) => polyline(line.map(fromSvg)))
}

function flipperEntities(): Entity[] {
  const contact = flipperShape(profile())
  const main = computeLayout().flippers.flatMap((f) => [
    flipperOutline(f.pivot, contact.baseRadius, contact.tipRadius, contact.length, f.angle),
    flipperOutline(f.pivot, profile().baseRadius, profile().tipRadius, contact.length, f.angle),
  ])
  const extra = extraFlippers.flatMap((f) => {
    const stock = flipperProfile(f.profile)
    const shape = flipperShape(stock)
    const { pivot, angle } = extraFlipperLayout(resolvedExtraFlipper(f))
    return [
      flipperOutline(pivot, shape.baseRadius, shape.tipRadius, shape.length, angle),
      flipperOutline(pivot, stock.baseRadius, stock.tipRadius, shape.length, angle),
    ]
  })
  return [...main, ...extra]
}

function mechEntities(): Entity[] {
  // Custom mechs are already measured up from the bottom lip.
  return reserved.map(
    (area): Entity =>
      area.kind === 'circle'
        ? { kind: 'circle', center: area.center, radius: area.radius }
        : polyline(area.points, true),
  )
}

const ENTITIES: Record<DrawingPart, () => Entity[]> = {
  playfield: playfieldEntities,
  lanes: laneEntities,
  laneCenters: laneCenterEntities,
  paths: pathEntities,
  flippers: flipperEntities,
  mechs: mechEntities,
}

// Group codes and values, one per line.
const num = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 1e6) / 1e6) : '0')

function entityCodes(entity: Entity, layer: string): (string | number)[] {
  if (entity.kind === 'circle') {
    return [0, 'CIRCLE', 8, layer, 10, num(entity.center.x), 20, num(entity.center.y), 30, 0, 40, num(entity.radius)]
  }
  return [
    0,
    'POLYLINE',
    8,
    layer,
    66,
    1,
    10,
    0,
    20,
    0,
    30,
    0,
    70,
    entity.closed ? 1 : 0,
    ...entity.vertices.flatMap((v) => [
      0,
      'VERTEX',
      8,
      layer,
      10,
      num(v.x),
      20,
      num(v.y),
      30,
      0,
      ...(v.bulge ? [42, num(v.bulge)] : []),
    ]),
    0,
    'SEQEND',
    8,
    layer,
  ]
}

const chosenParts = (parts: Record<DrawingPart, boolean>) =>
  DRAWING_PARTS.filter(({ part }) => parts[part]).map(({ part }) => part)

/**
 * The parts chosen, as a DXF drawing: AutoCAD R12 (AC1009), the plainest
 * flavor, which every CAD program reads. Reads the stores.
 */
export function exportDxf(parts: Record<DrawingPart, boolean>): string {
  const chosen = chosenParts(parts)
  const tables = [
    [0, 'SECTION', 2, 'TABLES'],
    [0, 'TABLE', 2, 'LTYPE', 70, 1],
    [0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, 0],
    [0, 'ENDTAB'],
    [0, 'TABLE', 2, 'LAYER', 70, chosen.length],
    ...chosen.map((part) => [0, 'LAYER', 2, LAYERS[part].name, 70, 0, 62, LAYERS[part].color, 6, 'CONTINUOUS']),
    [0, 'ENDTAB'],
    [0, 'ENDSEC'],
  ].flat()
  const entities = chosen.flatMap((part) => ENTITIES[part]().flatMap((e) => entityCodes(e, LAYERS[part].name)))
  const codes = [
    [0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009'],
    [9, '$EXTMIN', 10, 0, 20, 0, 9, '$EXTMAX', 10, num(playfield.width), 20, num(playfield.height)],
    [0, 'ENDSEC'],
    tables,
    [0, 'SECTION', 2, 'ENTITIES'],
    entities,
    [0, 'ENDSEC', 0, 'EOF'],
  ].flat()
  return codes.join('\r\n') + '\r\n'
}

// Back to SVG's y down from the top.
const toSvg = (p: Point) => `${num(p.x)} ${num(playfield.height - p.y)}`

/** Path data for a polyline, its bulges as arcs. */
function svgPathData(vertices: Vertex[], closed: boolean): string {
  const steps = vertices.map((v, i) => {
    if (i === 0) return `M ${toSvg(v)}`
    const from = vertices[i - 1]
    return from.bulge ? arcTo(from, v, from.bulge) : `L ${toSvg(v)}`
  })
  const last = vertices.at(-1)
  if (closed && last?.bulge) steps.push(arcTo(last, vertices[0], last.bulge))
  return steps.join(' ') + (closed ? ' Z' : '')
}

/** Arc from `a` to `b` turning through 4·atan(bulge), counter-clockwise if positive. */
function arcTo(a: Point, b: Point, bulge: number) {
  const sweep = 4 * Math.atan(Math.abs(bulge))
  const radius = Math.hypot(b.x - a.x, b.y - a.y) / (2 * Math.sin(sweep / 2))
  // Counter-clockwise with y up is counter-clockwise on screen, which with
  // SVG's y down is sweep-flag 0.
  return `A ${num(radius)} ${num(radius)} 0 ${sweep > Math.PI ? 1 : 0} ${bulge > 0 ? 0 : 1} ${toSvg(b)}`
}

function svgElement(entity: Entity): string {
  if (entity.kind === 'circle') {
    const [cx, cy] = toSvg(entity.center).split(' ')
    return `<circle cx="${cx}" cy="${cy}" r="${num(entity.radius)}"/>`
  }
  return `<path d="${svgPathData(entity.vertices, entity.closed)}"/>`
}

/**
 * The parts chosen, as an SVG drawing sized in inches. Each part is a group,
 * marked as a layer for Inkscape. Reads the stores.
 */
export function exportSvg(parts: Record<DrawingPart, boolean>): string {
  const { width, height } = playfield
  const groups = chosenParts(parts).map((part) => {
    const { name, stroke } = LAYERS[part]
    const elements = ENTITIES[part]().map((e) => `    ${svgElement(e)}`)
    return [
      `  <g id="${name}" inkscape:groupmode="layer" inkscape:label="${name}" stroke="${stroke}">`,
      ...elements,
      '  </g>',
    ].join('\n')
  })
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${num(width)}in" height="${num(height)}in" viewBox="0 0 ${num(width)} ${num(height)}" fill="none" stroke-width="${SVG_STROKE}" stroke-linejoin="round" stroke-linecap="round">`,
    ...groups,
    '</svg>',
    '',
  ].join('\n')
}
