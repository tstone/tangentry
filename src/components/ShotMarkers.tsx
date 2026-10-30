import { For } from 'solid-js'
import { playfield } from '../state/playfield'
import { selectedId, setEntrance, setExit, setSelectedId, shots, updateShot, type Shot } from '../state/shots'
import type { Point } from '../geometry/flipper'
import { startDrag } from './drag'

// Display radius of the entrance and exit handles, in inches.
const HANDLE_RADIUS = 0.3
// Display radius of the exit direction handle, in inches.
const DIRECTION_RADIUS = 0.18
// Distance from the exit to its direction handle at an exit weight of 1, in
// inches. Dragging the handle further out raises the weight.
const DIRECTION_LENGTH = 1.5
const MIN_WEIGHT = 0.1
const MAX_WEIGHT = 5

// Dragged positions snap to this increment so the sidebar fields stay readable.
const SNAP = 1 / 16

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const snap = (value: number) => Math.round(value / SNAP) * SNAP

const snapToPlayfield = (p: Point) => ({
  x: snap(clamp(p.x, 0, playfield.width)),
  y: snap(clamp(p.y, 0, playfield.height)),
})

/**
 * Draggable entrance, exit and exit direction handles for every shot.
 * Grabbing one selects its shot. Must be rendered inside the preview SVG.
 */
export default function ShotMarkers() {
  const grab = (shot: Shot, event: PointerEvent, onMove: (p: Point) => void) => {
    if (startDrag(event, onMove)) setSelectedId(shot.id)
  }

  return (
    <g class="shots">
      <For each={shots}>
        {(shot) => {
          const exitAngle = () => (shot.exit.angle * Math.PI) / 180
          const exit = () => ({ x: shot.exit.x, y: playfield.height - shot.exit.y })
          const direction = () => ({
            x: exit().x + DIRECTION_LENGTH * shot.exitWeight * Math.cos(exitAngle()),
            y: exit().y - DIRECTION_LENGTH * shot.exitWeight * Math.sin(exitAngle()),
          })
          return (
            <g class="shot-markers" classList={{ 'is-selected': selectedId() === shot.id }}>
              <line
                class="shot-exit-direction"
                x1={exit().x}
                y1={exit().y}
                x2={direction().x}
                y2={direction().y}
                vector-effect="non-scaling-stroke"
              />
              <circle
                class="shot-handle shot-exit"
                cx={exit().x}
                cy={exit().y}
                r={HANDLE_RADIUS}
                vector-effect="non-scaling-stroke"
                onPointerDown={(e) => grab(shot, e, (p) => setExit(shot.id, snapToPlayfield(p)))}
              >
                <title>{shot.name} exit</title>
              </circle>
              <circle
                class="shot-handle shot-exit-angle"
                cx={direction().x}
                cy={direction().y}
                r={DIRECTION_RADIUS}
                vector-effect="non-scaling-stroke"
                onPointerDown={(e) =>
                  grab(shot, e, (p) => {
                    const dx = p.x - shot.exit.x
                    const dy = p.y - shot.exit.y
                    const degrees = (Math.atan2(dy, dx) * 180) / Math.PI
                    const weight = clamp(Math.hypot(dx, dy) / DIRECTION_LENGTH, MIN_WEIGHT, MAX_WEIGHT)
                    setExit(shot.id, { angle: Math.round(degrees) })
                    updateShot(shot.id, { exitWeight: Math.round(weight * 20) / 20 })
                  })
                }
              >
                <title>{shot.name} exit direction and weight</title>
              </circle>
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
