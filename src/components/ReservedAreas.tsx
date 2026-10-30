import { For, Match, Switch, onCleanup } from 'solid-js'
import { playfield } from '../state/playfield'
import {
  MIN_POLYGON_POINTS,
  areaCenter,
  movePoint,
  moveReserved,
  removePoint,
  reserved,
  selectedReservedId,
  setCircle,
  setSelectedReservedId,
  type ReservedCircle,
  type ReservedPolygon,
} from '../state/reserved'
import { hoveredReserved, setHoveredReserved } from '../state/view'
import type { Point } from '../geometry/flipper'
import { clickUnlessDragged, startDrag } from './drag'

// Display radius of the grab dot in the middle of an area, in inches.
const MOVE_RADIUS = 0.3
// Display radius of corner and radius handles, in inches.
const POINT_RADIUS = 0.22
const MIN_RADIUS = 0.25

// Dragged positions snap to this increment so the sidebar fields stay readable.
const SNAP = 1 / 16

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const snap = (value: number) => Math.round(value / SNAP) * SNAP

const snapToPlayfield = (p: Point) => ({
  x: snap(clamp(p.x, 0, playfield.width)),
  y: snap(clamp(p.y, 0, playfield.height)),
})

// SVG y grows downward; areas are measured up from the bottom lip.
const toSvg = (p: Point) => ({ x: p.x, y: playfield.height - p.y })

const polygonPoints = (area: ReservedPolygon) =>
  area.points.map((p) => `${p.x},${playfield.height - p.y}`).join(' ')

/** Mouse handlers that mark an area hovered while the pointer is over it. */
const hoverHandlers = (id: number) => ({
  onPointerEnter: () => setHoveredReserved(id),
  onPointerLeave: () => setHoveredReserved((hovered) => (hovered === id ? null : hovered)),
})

/**
 * Outlines of the reserved areas, drawn under the lanes. Hovering one lights
 * its move dot; clicking it selects it. Must be rendered inside the preview SVG.
 */
export default function ReservedAreas() {
  return (
    <g class="reserved-areas">
      <For each={reserved}>
        {(area) => {
          onCleanup(() => {
            if (hoveredReserved() === area.id) setHoveredReserved(null)
          })
          return (
            <g
              class="reserved-area"
              classList={{ 'is-selected': selectedReservedId() === area.id, 'is-hovered': hoveredReserved() === area.id }}
              {...hoverHandlers(area.id)}
              onPointerDown={(e) => clickUnlessDragged(e, () => setSelectedReservedId(area.id))}
            >
              <title>{area.name}: click to select</title>
              <Switch>
                <Match when={area.kind === 'circle' && area}>
                  {(circle) => (
                    <circle
                      class="reserved-shape"
                      cx={circle().center.x}
                      cy={playfield.height - circle().center.y}
                      r={circle().radius}
                      vector-effect="non-scaling-stroke"
                    />
                  )}
                </Match>
                <Match when={area.kind === 'polygon' && area}>
                  {(polygon) => (
                    <polygon class="reserved-shape" points={polygonPoints(polygon())} vector-effect="non-scaling-stroke" />
                  )}
                </Match>
              </Switch>
              <text class="reserved-label" x={areaCenter(area).x} y={playfield.height - areaCenter(area).y - 0.5}>
                {area.name}
              </text>
            </g>
          )
        }}
      </For>
    </g>
  )
}

function CircleHandles(props: { area: ReservedCircle; grab: (e: PointerEvent, onMove: (p: Point) => void) => void }) {
  // The radius handle sits on the right edge.
  const edge = () => toSvg({ x: props.area.center.x + props.area.radius, y: props.area.center.y })
  return (
    <circle
      class="reserved-handle reserved-point"
      cx={edge().x}
      cy={edge().y}
      r={POINT_RADIUS}
      vector-effect="non-scaling-stroke"
      onPointerDown={(e) =>
        props.grab(e, (p) => {
          const r = Math.hypot(p.x - props.area.center.x, p.y - props.area.center.y)
          setCircle(props.area.id, { radius: Math.max(MIN_RADIUS, snap(r)) })
        })
      }
    >
      <title>{props.area.name} radius</title>
    </circle>
  )
}

function PolygonHandles(props: { area: ReservedPolygon; grab: (e: PointerEvent, onMove: (p: Point) => void) => void }) {
  return (
    <For each={props.area.points}>
      {(point, i) => (
        <circle
          class="reserved-handle reserved-point"
          cx={point.x}
          cy={playfield.height - point.y}
          r={POINT_RADIUS}
          vector-effect="non-scaling-stroke"
          onPointerDown={(e) => props.grab(e, (p) => movePoint(props.area.id, point.id, snapToPlayfield(p)))}
          onDblClick={() => removePoint(props.area.id, point.id)}
        >
          <title>
            {props.area.name} corner {i() + 1}: drag to move
            {props.area.points.length > MIN_POLYGON_POINTS ? ', double-click to remove' : ''}
          </title>
        </circle>
      )}
    </For>
  )
}

/**
 * Draggable handles for every reserved area: a dot in the middle to move it,
 * and its corners or radius to shape it. Grabbing one selects its area. Must
 * be rendered inside the preview SVG, above the lanes.
 */
export function ReservedMarkers() {
  return (
    <g class="reserved-markers">
      <For each={reserved}>
        {(area) => {
          const grab = (event: PointerEvent, onMove: (p: Point) => void) => {
            if (startDrag(event, onMove)) setSelectedReservedId(area.id)
          }
          const center = () => toSvg(areaCenter(area))
          // Moves by whole snap steps, so corners already on the grid stay on it.
          const dragMove = (event: PointerEvent) => {
            const start = areaCenter(area)
            let from: Point | null = null
            grab(event, (p) => {
              from ??= p
              moveReserved(area.id, { x: start.x + snap(p.x - from.x), y: start.y + snap(p.y - from.y) })
            })
          }
          return (
            <g
              class="reserved-handles"
              classList={{ 'is-selected': selectedReservedId() === area.id, 'is-hovered': hoveredReserved() === area.id }}
              {...hoverHandlers(area.id)}
            >
              <Switch>
                <Match when={area.kind === 'circle' && area}>
                  {(circle) => <CircleHandles area={circle()} grab={grab} />}
                </Match>
                <Match when={area.kind === 'polygon' && area}>
                  {(polygon) => <PolygonHandles area={polygon()} grab={grab} />}
                </Match>
              </Switch>
              <circle
                class="reserved-handle reserved-move"
                cx={center().x}
                cy={center().y}
                r={MOVE_RADIUS}
                vector-effect="non-scaling-stroke"
                onPointerDown={dragMove}
              >
                <title>{area.name}: drag to move</title>
              </circle>
            </g>
          )
        }}
      </For>
    </g>
  )
}

