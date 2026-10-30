import { For, Show, createSignal, onCleanup } from 'solid-js'
import { playfield } from '../state/playfield'
import {
  exitForHorseshoe,
  feedChain,
  horseshoeCenter,
  linkShots,
  moveVia,
  removeVia,
  selectedId,
  setEntrance,
  setExit,
  setSelectedId,
  shots,
  updateShot,
  type Shot,
} from '../state/shots'
import { shotAnalyses } from '../state/solutions'
import { hoveredShot, setHoveredShot } from '../state/view'
import type { Point } from '../geometry/flipper'
import { clickUnlessDragged, startDrag } from './drag'

// Display radius of the entrance and exit handles, in inches.
const HANDLE_RADIUS = 0.3
// Display radius of bend point handles, in inches.
const VIA_RADIUS = 0.22
// Display radius of the exit direction handle, in inches.
const DIRECTION_RADIUS = 0.18
// Distance from the exit to its direction handle at an exit weight of 1, in
// inches. Dragging the handle further out raises the weight.
const DIRECTION_LENGTH = 1.5
const MIN_WEIGHT = 0.1
const MAX_WEIGHT = 5
// How near another lane's exit the direction handle must be let go to join
// the two lanes, inches.
const LINK_RADIUS = 0.4

// Dragged positions snap to this increment so the sidebar fields stay readable.
const SNAP = 1 / 16

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const snap = (value: number) => Math.round(value / SNAP) * SNAP

const snapToPlayfield = (p: Point) => ({
  x: snap(clamp(p.x, 0, playfield.width)),
  y: snap(clamp(p.y, 0, playfield.height)),
})

// Shot whose exit a direction handle is being dragged over, to join to it.
const [linkTarget, setLinkTarget] = createSignal<number | null>(null)

/**
 * A shot not yet joined to another, nor ending in a horseshoe, whose exit is
 * close enough to `p` to join `id`'s lane to.
 */
const linkTargetAt = (id: number, p: Point) =>
  shots.find(
    (s) =>
      s.id !== id && s.link === null && s.end === 'open' && Math.hypot(s.exit.x - p.x, s.exit.y - p.y) < LINK_RADIUS,
  )?.id ?? null

/**
 * Draggable entrance, exit and exit direction handles for every shot.
 * Grabbing one selects its shot. Must be rendered inside the preview SVG.
 */
export default function ShotMarkers() {
  const grab = (shot: Shot, event: PointerEvent, onMove: (p: Point) => void, onEnd?: () => void) => {
    if (startDrag(event, onMove, onEnd)) setSelectedId(shot.id)
  }

  return (
    <g class="shots">
      <For each={shots}>
        {(shot) => {
          const exitAngle = () => (shot.exit.angle * Math.PI) / 180
          const exit = () => ({ x: shot.exit.x, y: playfield.height - shot.exit.y })
          const horseshoe = () => shot.end === 'horseshoe' && shot.link === null
          // Only open lanes can be dropped on another lane's exit to join it.
          const joinable = () => shot.link === null && shot.end === 'open'
          // Joined to another lane, the handle sits back over this lane, so
          // the two lanes' handles make one arm through their shared exit.
          const reach = () => (shot.link === null ? 1 : -1) * DIRECTION_LENGTH * shot.exitWeight
          const direction = () => ({
            x: exit().x + reach() * Math.cos(exitAngle()),
            y: exit().y - reach() * Math.sin(exitAngle()),
          })
          // Dropping either an exit or its direction handle on another
          // lane's exit joins the two lanes.
          const dragExit = (event: PointerEvent) => {
            let target: number | null = null
            grab(
              shot,
              event,
              (p) => {
                setExit(shot.id, snapToPlayfield(p))
                target = joinable() ? linkTargetAt(shot.id, p) : null
                setLinkTarget(target)
              },
              () => {
                setLinkTarget(null)
                if (target !== null) linkShots(shot.id, target)
              },
            )
          }
          // A horseshoe is grabbed by its center, which carries the exit with it.
          // Snaps the exit rather than the center, so the exit fields stay readable.
          const dragHorseshoe = (event: PointerEvent) =>
            grab(shot, event, (p) => setExit(shot.id, snapToPlayfield(exitForHorseshoe(shot, p))))
          const center = () => {
            const c = horseshoeCenter(shot)
            return { x: c.x, y: playfield.height - c.y }
          }
          const dragDirection = (event: PointerEvent) => {
            const weight = shot.exitWeight
            let target: number | null = null
            grab(
              shot,
              event,
              (p) => {
                const back = shot.link === null ? 1 : -1
                const dx = back * (p.x - shot.exit.x)
                const dy = back * (p.y - shot.exit.y)
                const degrees = (Math.atan2(dy, dx) * 180) / Math.PI
                const weight = clamp(Math.hypot(dx, dy) / DIRECTION_LENGTH, MIN_WEIGHT, MAX_WEIGHT)
                setExit(shot.id, { angle: Math.round(degrees) })
                updateShot(shot.id, { exitWeight: Math.round(weight * 20) / 20 })
                target = joinable() ? linkTargetAt(shot.id, p) : null
                setLinkTarget(target)
              },
              () => {
                setLinkTarget(null)
                if (target === null) return
                // Dropped on another lane's exit: join them, keeping the weight
                // from before it was dragged over there.
                updateShot(shot.id, { exitWeight: weight })
                linkShots(shot.id, target)
              },
            )
          }
          return (
            <g
              class="shot-markers"
              classList={{
                'is-selected': selectedId() === shot.id,
                // Shown while another lane's handle is dragged over it, to join to.
                'is-link-target': linkTarget() === shot.id,
              }}
            >
              {/* Across open playfield from the exit feeding this lane. */}
              <Show when={feedChain(shot).at(-1)}>
                {(from) => (
                  <line
                    class="shot-feed"
                    x1={from().exit.x}
                    y1={playfield.height - from().exit.y}
                    x2={shot.entrance.x}
                    y2={playfield.height - shot.entrance.y}
                    vector-effect="non-scaling-stroke"
                  />
                )}
              </Show>
              <line
                class="shot-exit-direction"
                x1={exit().x}
                y1={exit().y}
                x2={direction().x}
                y2={direction().y}
                vector-effect="non-scaling-stroke"
              />
              <Show
                when={horseshoe()}
                fallback={
                  <circle
                    class="shot-handle shot-exit"
                    classList={{ 'is-link-target': linkTarget() === shot.id }}
                    cx={exit().x}
                    cy={exit().y}
                    r={HANDLE_RADIUS}
                    vector-effect="non-scaling-stroke"
                    onPointerDown={dragExit}
                  >
                    <title>
                      {shot.name} exit
                      {joinable() ? ": drop on another lane's exit to join the lanes" : ''}
                    </title>
                  </circle>
                }
              >
                <circle
                  class="shot-handle shot-exit"
                  cx={center().x}
                  cy={center().y}
                  r={HANDLE_RADIUS}
                  vector-effect="non-scaling-stroke"
                  onPointerDown={dragHorseshoe}
                >
                  <title>{shot.name} horseshoe center: drag to move the exit and horseshoe</title>
                </circle>
              </Show>
              <circle
                class="shot-handle shot-exit-angle"
                cx={direction().x}
                cy={direction().y}
                r={DIRECTION_RADIUS}
                vector-effect="non-scaling-stroke"
                onPointerDown={dragDirection}
              >
                <title>
                  {shot.name} exit direction and weight
                  {joinable() ? ": drop on another lane's exit to join the lanes" : ''}
                </title>
              </circle>
              <For each={shot.via}>
                {(point, i) => (
                  <circle
                    class="shot-handle shot-via"
                    cx={point.x}
                    cy={playfield.height - point.y}
                    r={VIA_RADIUS}
                    vector-effect="non-scaling-stroke"
                    onPointerDown={(e) => grab(shot, e, (p) => moveVia(shot.id, point.id, snapToPlayfield(p)))}
                    onDblClick={() => removeVia(shot.id, point.id)}
                  >
                    <title>
                      {shot.name} bend point {i() + 1}: drag to move, double-click to remove
                    </title>
                  </circle>
                )}
              </For>
              <circle
                class="shot-handle shot-entrance"
                cx={shot.entrance.x}
                cy={playfield.height - shot.entrance.y}
                r={HANDLE_RADIUS}
                vector-effect="non-scaling-stroke"
                onPointerDown={(e) => grab(shot, e, (p) => setEntrance(shot.id, snapToPlayfield(p)))}
              >
                <title>{shot.name} entrance</title>
              </circle>
            </g>
          )
        }}
      </For>
    </g>
  )
}

/**
 * Click targets over every unselected shot's lane. Hovering one brings up
 * its entrance and lights its lane; clicking selects the shot. A press that
 * turns into a drag pans the view as usual. Must be rendered inside the
 * preview SVG, under the selected shot's handles.
 */
export function ShotPickers() {
  // Keyed by shot, so a picker survives its lane being recomputed.
  const unselected = () => shots.filter((s) => s.id !== selectedId())
  return (
    <g class="shot-pickers">
      <For each={unselected()}>
        {(shot) => {
          const lane = () => shotAnalyses().find((a) => a.id === shot.id)?.lane
          onCleanup(() => {
            if (hoveredShot() === shot.id) setHoveredShot(null)
          })
          const press = (event: PointerEvent) => clickUnlessDragged(event, () => setSelectedId(shot.id))
          return (
            <g
              class="shot-picker"
              classList={{ 'is-hovered': hoveredShot() === shot.id, 'has-lane': !!lane() }}
              onPointerEnter={() => setHoveredShot(shot.id)}
              onPointerLeave={() => setHoveredShot((id) => (id === shot.id ? null : id))}
              onPointerDown={press}
            >
              <title>{shot.name}: click to select</title>
              {/* The lane's whole width picks it, out to the walls. */}
              <Show when={lane()}>
                {(l) => (
                  <polyline
                    class="shot-picker-lane"
                    points={l()
                      .center.filter((c) => c.s <= l().exitDistance)
                      .map((c) => `${c.p.x},${c.p.y}`)
                      .join(' ')}
                    stroke-width={Math.max(shot.entranceWidth, shot.exitWidth)}
                  />
                )}
              </Show>
              <circle
                class="shot-picker-entrance"
                cx={shot.entrance.x}
                cy={playfield.height - shot.entrance.y}
                r={HANDLE_RADIUS}
                vector-effect="non-scaling-stroke"
              />
            </g>
          )
        }}
      </For>
    </g>
  )
}
