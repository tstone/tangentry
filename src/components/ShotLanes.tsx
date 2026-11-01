import { For, Show, createMemo } from 'solid-js'
import { playfield } from '../state/playfield'
import {
  selectedId,
  setSelectedId,
  setWallEnd,
  shots,
  updateMount,
  type Shot,
  type WallExtent,
  type WallMount,
  type WallSide,
} from '../state/shots'
import { WALL_SIDES, laneCrossings, laneOutlines, shotAnalyses, type LaneWall } from '../state/solutions'
import { reservedCrossedBy } from '../state/reserved'
import { hoveredShot } from '../state/view'
import type { Point } from '../geometry/flipper'
import { focusOn, focusedPart, type WallPart } from '../state/focus'
import { unit } from '../geometry/lane'
import { clickUnlessDragged, startDrag } from './drag'
import { ArrowHandle } from './ShotMarkers'

const points = (list: Point[]) => list.map((p) => `${p.x},${p.y}`).join(' ')

// Size of a mount marker, inches.
const MOUNT_SIZE = 0.16
// Radius around a mount that picks it up, inches.
const MOUNT_GRAB_RADIUS = 0.3
// Width of the band along a wall that picks it, inches.
const WALL_GRAB_WIDTH = 0.4

/** Lane walls for every shot. Must be rendered inside the preview SVG. */
export default function ShotLanes() {
  return (
    <g class="shot-lanes">
      <For each={shotAnalyses()}>
        {(analysis) => (
          <Show when={analysis.lane}>
            {(lane) => {
              const crossesReserved = createMemo(() =>
                laneOutlines(lane()).some((outline) => reservedCrossedBy(outline).length > 0),
              )
              const crossesLane = () => laneCrossings().has(analysis.id)
              return (
                <g
                  class="shot-lane"
                  classList={{
                    'is-selected': analysis.id === selectedId(),
                    'is-hovered': analysis.id === hoveredShot(),
                    'is-invalid': lane().tooNarrow || lane().overRail > 0 || crossesReserved() || crossesLane(),
                  }}
                >
                  {/* A wall is drawn in pieces, broken where the lane has an open span. */}
                  <For each={lane().walls}>
                    {(wall) => (
                      <For each={wall.pieces}>
                        {([first, last]) => (
                          <polyline
                            class="shot-lane-wall"
                            points={points(wall.points.slice(first, last + 1))}
                            vector-effect="non-scaling-stroke"
                          />
                        )}
                      </For>
                    )}
                  </For>
                </g>
              )
            }}
          </Show>
        )}
      </For>
    </g>
  )
}

/** Fraction of the way along a wall to the point on it nearest `p` (SVG coordinates). */
function nearestAlong(wall: LaneWall, p: Point) {
  const total = wall.lengths.at(-1) || 1
  let best = { distance: Infinity, along: 0 }
  for (let i = 0; i < wall.points.length - 1; i++) {
    const a = wall.points[i]
    const b = wall.points[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const span = dx * dx + dy * dy
    const t = span > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / span)) : 0
    const distance = Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y)
    if (distance < best.distance) best = { distance, along: wall.lengths[i] + (wall.lengths[i + 1] - wall.lengths[i]) * t }
  }
  return best.along / total
}

/**
 * A wall mount on the outside of the wall: a square for a spade bolt, a
 * triangle pointing at the wall for a spike. Dragging it slides it along
 * the wall.
 */
function MountMarker(props: { shotId: number; side: WallSide; mount: WallMount }) {
  // Where the mount sits comes from the solved lane, which is rebuilt as it
  // moves; the marker itself follows the stored mount so a drag survives.
  const wall = () =>
    shotAnalyses()
      .find((a) => a.id === props.shotId)
      ?.lane?.walls.find((w) => w.side === props.side)
  const placed = () => wall()?.mounts.find((m) => m.id === props.mount.id)
  const at = (along: number, out: number): Point => {
    const m = placed()!
    // Along the wall is a quarter turn from outward.
    return {
      x: m.point.x - m.outward.y * along + m.outward.x * out,
      y: m.point.y + m.outward.x * along + m.outward.y * out,
    }
  }
  const h = MOUNT_SIZE / 2
  const shape = () =>
    props.mount.kind === 'spade'
      ? [at(-h, 0), at(h, 0), at(h, MOUNT_SIZE), at(-h, MOUNT_SIZE)]
      : [at(-h, MOUNT_SIZE), at(h, MOUNT_SIZE), at(0, 0)]
  const grab = (event: PointerEvent) => {
    const started = startDrag(event, (p) => {
      const w = wall()
      if (w) updateMount(props.shotId, props.side, props.mount.id, { at: nearestAlong(w, { x: p.x, y: playfield.height - p.y }) })
    })
    if (started) setSelectedId(props.shotId)
  }
  return (
    <Show when={placed()}>
      <g class="shot-lane-mount-handle" onPointerDown={grab}>
        <title>{props.mount.kind === 'spade' ? 'Spade bolt' : 'Spike'}: drag along the wall to move</title>
        <circle class="shot-lane-mount-target" cx={at(0, h).x} cy={at(0, h).y} r={MOUNT_GRAB_RADIUS} />
        <polygon
          class={`shot-lane-mount shot-lane-mount--${props.mount.kind}`}
          points={points(shape())}
          vector-effect="non-scaling-stroke"
        />
      </g>
    </Show>
  )
}

/**
 * Draggable wall mounts for every shot. Drawn above the ball paths so they
 * can be grabbed. Must be rendered inside the preview SVG.
 */
export function WallMounts() {
  return (
    <g class="shot-lane-mounts">
      <For each={shots}>
        {(shot) => (
          <g class="shot-lane" classList={{ 'is-selected': shot.id === selectedId() }}>
            <For each={WALL_SIDES}>
              {({ side }) => (
                <For each={shot.mounts[side]}>{(m) => <MountMarker shotId={shot.id} side={side} mount={m} />}</For>
              )}
            </For>
          </g>
        )}
      </For>
    </g>
  )
}

const wallPart = (side: WallSide): WallPart => `${side}-wall`

/** One of the selected shot's lane walls, as solved. */
const solvedWall = (shotId: number, side: WallSide) =>
  shotAnalyses()
    .find((a) => a.id === shotId)
    ?.lane?.walls.find((w) => w.side === side)

/** The point `along` a wall, as a fraction of its length, and the direction it runs there. */
function pointAlong(wall: LaneWall, along: number) {
  const target = along * (wall.lengths.at(-1) ?? 0)
  const last = wall.points.length - 1
  let i = 0
  while (i < last - 1 && wall.lengths[i + 1] < target) i++
  const a = wall.points[i]
  const b = wall.points[i + 1]
  const span = wall.lengths[i + 1] - wall.lengths[i]
  const f = span > 0 ? Math.min(1, Math.max(0, (target - wall.lengths[i]) / span)) : 0
  return { at: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, dir: unit({ x: b.x - a.x, y: b.y - a.y }) }
}

/**
 * Click targets along the selected shot's walls. Clicking one picks out
 * that wall, bringing up sliders at its ends. Drawn under the mounts, so
 * they can still be grabbed. Must be rendered inside the preview SVG.
 */
export function WallPickers() {
  const selected = () => shots.find((s) => s.id === selectedId())
  return (
    <g class="shot-wall-pickers">
      <Show when={selected()}>
        {(shot) => (
          <For each={WALL_SIDES}>
            {({ side, label }) => {
              const wall = () => solvedWall(shot().id, side)
              const press = (event: PointerEvent) => clickUnlessDragged(event, () => focusOn('shot', shot().id, wallPart(side)))
              return (
                <Show when={wall()}>
                  {(w) => (
                    <g class="shot-wall-picker" onPointerDown={press}>
                      <title>{`${shot().name} ${label.toLowerCase()}: click to adjust where it starts and ends`}</title>
                      <For each={w().pieces}>
                        {([first, last]) => (
                          <polyline
                            class="shot-wall-picker-line"
                            points={points(w().points.slice(first, last + 1))}
                            stroke-width={WALL_GRAB_WIDTH}
                          />
                        )}
                      </For>
                    </g>
                  )}
                </Show>
              )
            }}
          </For>
        )}
      </Show>
    </g>
  )
}

/**
 * Sliders at both ends of the selected shot's picked wall, which cut it
 * short or let it out again, along its line. Drawn above the mounts. Must
 * be rendered inside the preview SVG.
 */
export function WallEndSliders() {
  const picked = () => {
    const shot = shots.find((s) => s.id === selectedId())
    const part = shot && focusedPart('shot', shot.id)
    const side = WALL_SIDES.find((w) => wallPart(w.side) === part)
    return shot && side ? { shot, side: side.side, label: side.label } : null
  }
  return (
    <g class="shot-wall-ends">
      <Show when={picked()}>
        {(p) => <WallEnds shot={p().shot} side={p().side} label={p().label} />}
      </Show>
    </g>
  )
}

function WallEnds(props: { shot: Shot; side: WallSide; label: string }) {
  const wall = () => solvedWall(props.shot.id, props.side)
  const ENDS: { end: keyof WallExtent; name: string }[] = [
    { end: 'from', name: 'start' },
    { end: 'to', name: 'end' },
  ]
  return (
    <Show when={wall()}>
      {(w) => (
        <>
          {/* The wall picked out, lit up. */}
          <For each={w().pieces}>
            {([first, last]) => (
              <polyline
                class="shot-wall-focused"
                points={points(w().points.slice(first, last + 1))}
                vector-effect="non-scaling-stroke"
              />
            )}
          </For>
          <For each={ENDS}>
            {({ end, name }) => {
              const place = () => pointAlong(w(), props.shot.wallExtent[props.side][end])
              const drag = (event: PointerEvent) => {
                startDrag(event, (p) => {
                  const current = wall()
                  if (current)
                    setWallEnd(props.shot.id, props.side, end, nearestAlong(current, { x: p.x, y: playfield.height - p.y }))
                })
              }
              return (
                <ArrowHandle
                  class="shot-wall-end"
                  at={place().at}
                  along={place().dir}
                  onPointerDown={drag}
                  title={`${props.shot.name} ${props.label.toLowerCase()} ${name}: slide along the wall to shorten or lengthen it`}
                />
              )
            }}
          </For>
        </>
      )}
    </Show>
  )
}
