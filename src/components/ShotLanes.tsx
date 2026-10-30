import { For, Show, createMemo } from 'solid-js'
import { playfield } from '../state/playfield'
import { selectedId, setSelectedId, shots, updateMount, type WallMount, type WallSide } from '../state/shots'
import { WALL_SIDES, laneCrossings, laneOutline, shotAnalyses, type LaneWall } from '../state/solutions'
import { reservedCrossedBy } from '../state/reserved'
import type { Point } from '../geometry/flipper'
import { startDrag } from './drag'

const points = (list: Point[]) => list.map((p) => `${p.x},${p.y}`).join(' ')

// Size of a mount marker, inches.
const MOUNT_SIZE = 0.16
// Radius around a mount that picks it up, inches.
const MOUNT_GRAB_RADIUS = 0.3

/** Lane walls for every shot. Must be rendered inside the preview SVG. */
export default function ShotLanes() {
  return (
    <g class="shot-lanes">
      <For each={shotAnalyses()}>
        {(analysis) => (
          <Show when={analysis.lane}>
            {(lane) => {
              const crossesReserved = createMemo(() => reservedCrossedBy(laneOutline(lane())).length > 0)
              const crossesLane = () => laneCrossings().has(analysis.id)
              return (
                <g
                  class="shot-lane"
                  classList={{
                    'is-selected': analysis.id === selectedId(),
                    'is-invalid': lane().tooNarrow || lane().overRail > 0 || crossesReserved() || crossesLane(),
                  }}
                >
                  <For each={lane().walls}>
                    {(wall) => (
                      <polyline class="shot-lane-wall" points={points(wall.points)} vector-effect="non-scaling-stroke" />
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
