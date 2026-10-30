import { For, Show, onCleanup } from 'solid-js'
import { playfield } from '../state/playfield'
import {
  endPoint,
  exitForHorseshoe,
  feedChain,
  horseshoeCenter,
  moveVia,
  removeVia,
  selectedId,
  setEntrance,
  setExit,
  setSelectedId,
  shotEnds,
  shots,
  updateShot,
  type Shot,
  type ShotEnd,
} from '../state/shots'
import {
  fitOffset,
  laneExit,
  leavingExit,
  maxOffset as laneMaxOffset,
  shotAnalyses,
  turnOnScreen,
} from '../state/solutions'
import { hoveredShot, setHoveredShot } from '../state/view'
import { focusOn, focusedPart, type FocusPart } from '../state/focus'
import type { Point } from '../geometry/flipper'
import { normal } from '../geometry/lane'
import { clickUnlessDragged, startDrag } from './drag'

// Display radius of the entrance and exit handles, in inches.
const HANDLE_RADIUS = 0.3
// Display radius of bend point handles, in inches.
const VIA_RADIUS = 0.22
// Display radius of the weight and slider handles, in inches.
const DIRECTION_RADIUS = 0.18
// Distance from the exit to its direction handle at an exit weight of 1, in
// inches. Dragging the handle further out raises the weight.
const DIRECTION_LENGTH = 1.5
const MIN_WEIGHT = 0.1
const MAX_WEIGHT = 5
// Furthest a lane end pivots from the ball, degrees, either way, as the
// sidebar allows; the step it's dragged in; and how near lined up with the
// ball a drag has to come to snap back to it, so pulling the weight arm
// out doesn't pivot the lane by accident.
const MAX_PIVOT = 45
const PIVOT_STEP = 0.5
const PIVOT_SNAP = 2
// How far back out of the lane, toward where the ball comes from, the
// offset slider runs across a lane end's mouth, in inches.
const OFFSET_RAIL_BACK = 1
// How far outside the lane's right wall the lead-in slider runs, in inches.
const LEAD_IN_RAIL_SIDE = 0.5
// Longest straight lead-in, in inches, as the sidebar allows.
const MAX_LEAD_IN = 8
// Narrowest and widest a lane end can be, in inches, as the sidebar allows.
const MIN_WIDTH = 0.25
const MAX_WIDTH = 10

// Dragged positions snap to this increment so the sidebar fields stay readable.
const SNAP = 1 / 16

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const snap = (value: number) => Math.round(value / SNAP) * SNAP
const roundWeight = (weight: number) => Math.round(clamp(weight, MIN_WEIGHT, MAX_WEIGHT) * 20) / 20
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y

const snapToPlayfield = (p: Point) => ({
  x: snap(clamp(p.x, 0, playfield.width)),
  y: snap(clamp(p.y, 0, playfield.height)),
})

// Dragged point `p`, in playfield coordinates, relative to `from` in SVG
// coordinates, as lane directions are.
const svgFrom = (p: Point, from: Point) => ({ x: p.x - from.x, y: playfield.height - p.y - from.y })

// The handle grabbed last, which brings up its adjustments: an end of the
// lane, or a bend point by id.
type Grab = (shot: Shot, part: FocusPart, event: PointerEvent, onMove: (p: Point) => void) => void

/**
 * Draggable entrance, exit and bend point handles for every shot. Grabbing
 * one focuses it within its shot, so Delete and Escape act on it first, and
 * brings up its weight arm, and at an end the ball is shot into, its offset
 * and lead-in sliders. Must be rendered inside the preview SVG.
 */
export default function ShotMarkers() {
  const isFocused = (shot: Shot, part: FocusPart) => focusedPart('shot', shot.id) === part
  // Focus is set once, shot and part together, to where it ends up: clearing
  // it first, even briefly, would take a grabbed slider out of the page before
  // its drag could start.
  const grab: Grab = (shot, part, event, onMove) => {
    if (startDrag(event, onMove)) focusOn('shot', shot.id, part)
  }

  return (
    <g class="shots">
      <For each={shots}>
        {(shot) => {
          const exit = () => ({ x: shot.exit.x, y: playfield.height - shot.exit.y })
          const horseshoe = () => shot.end === 'horseshoe'
          const lane = () => shotAnalyses().find((a) => a.id === shot.id)?.lane
          // Out of the exit, radians counter-clockwise as seen on screen.
          const exitAngle = () => (shot.exit.angle * Math.PI) / 180
          const reach = () => DIRECTION_LENGTH * shot.exitWeight
          const direction = () => ({
            x: exit().x + reach() * Math.cos(exitAngle()),
            y: exit().y - reach() * Math.sin(exitAngle()),
          })
          const dragExit = (event: PointerEvent) =>
            grab(shot, 'exit', event, (p) => setExit(shot.id, snapToPlayfield(p)))
          // A horseshoe is grabbed by its center, which carries the exit with it.
          // Snaps the exit rather than the center, so the exit fields stay readable.
          const dragHorseshoe = (event: PointerEvent) =>
            grab(shot, 'exit', event, (p) => setExit(shot.id, snapToPlayfield(exitForHorseshoe(shot, p))))
          const center = () => {
            const c = horseshoeCenter(shot)
            return { x: c.x, y: playfield.height - c.y }
          }
          // A single-ended lane's exit handle sets its direction and weight.
          const dragDirection = (event: PointerEvent) =>
            grab(shot, 'exit', event, (p) => {
              const dx = p.x - shot.exit.x
              const dy = p.y - shot.exit.y
              setExit(shot.id, { angle: Math.round((Math.atan2(dy, dx) * 180) / Math.PI) })
              updateShot(shot.id, { exitWeight: roundWeight(Math.hypot(dx, dy) / DIRECTION_LENGTH) })
            })
          // Where a single-ended lane ends, heading out.
          const exitMouth = () => {
            const l = lane()
            return l?.center.length ? laneExit(l).sample : null
          }
          // The width handle sits on the left wall, as the ball leaves.
          const exitWall = (m: { p: Point; t: Point }, side: number) => ({
            x: m.p.x + side * (shot.exitWidth / 2) * normal(m.t).x,
            y: m.p.y + side * (shot.exitWidth / 2) * normal(m.t).y,
          })
          const dragExitWidth = (event: PointerEvent) =>
            grab(shot, 'exit', event, (p) => {
              const m = exitMouth()
              if (!m) return
              updateShot(shot.id, {
                exitWidth: clamp(snap(-2 * dot(svgFrom(p, m.p), normal(m.t))), MIN_WIDTH, MAX_WIDTH),
              })
            })
          return (
            <g class="shot-markers" classList={{ 'is-selected': selectedId() === shot.id }}>
              {/* Across open playfield from the lane end feeding each end of this one. */}
              <For each={shotEnds(shot)}>
                {(end) => (
                  <Show when={feedChain(shot, end).at(-1)}>
                    {(from) => {
                      const a = () => leavingExit(from().shot, from().leaves)
                      const b = () => endPoint(shot, end)
                      return (
                        <line
                          class="shot-feed"
                          x1={a().x}
                          y1={playfield.height - a().y}
                          x2={b().x}
                          y2={playfield.height - b().y}
                          vector-effect="non-scaling-stroke"
                        />
                      )
                    }}
                  </Show>
                )}
              </For>
              <Show when={shot.end !== 'double' && isFocused(shot, 'exit')}>
                <line
                  class="shot-exit-direction"
                  x1={exit().x}
                  y1={exit().y}
                  x2={direction().x}
                  y2={direction().y}
                  vector-effect="non-scaling-stroke"
                />
              </Show>
              <Show
                when={horseshoe()}
                fallback={
                  <circle
                    class="shot-handle shot-exit"
                    classList={{ 'is-double': shot.end === 'double' }}
                    cx={exit().x}
                    cy={exit().y}
                    r={HANDLE_RADIUS}
                    vector-effect="non-scaling-stroke"
                    onPointerDown={dragExit}
                  >
                    <title>
                      {shot.name} exit
                      {shot.end === 'double'
                        ? ', also an entrance: grab to bring up its weight, offset and lead-in'
                        : ': grab to bring up its direction, weight and width'}
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
              <Show when={shot.end !== 'double' && isFocused(shot, 'exit')}>
                <circle
                  class="shot-handle shot-exit-angle"
                  cx={direction().x}
                  cy={direction().y}
                  r={DIRECTION_RADIUS}
                  vector-effect="non-scaling-stroke"
                  onPointerDown={dragDirection}
                >
                  <title>{shot.name} exit direction and weight</title>
                </circle>
              </Show>
              <Show when={shot.end !== 'double' && isFocused(shot, 'exit') && exitMouth()}>
                {(m) => (
                  <>
                    {/* Across the mouth, wall to wall. */}
                    <line
                      class="shot-entrance-guide"
                      x1={exitWall(m(), 1).x}
                      y1={exitWall(m(), 1).y}
                      x2={exitWall(m(), -1).x}
                      y2={exitWall(m(), -1).y}
                      vector-effect="non-scaling-stroke"
                    />
                    <ArrowHandle
                      class="shot-width-slider"
                      at={exitWall(m(), -1)}
                      along={normal(m().t)}
                      onPointerDown={dragExitWidth}
                      title={`${shot.name} exit width: slide out or in to widen or narrow the lane`}
                    />
                  </>
                )}
              </Show>
              <For each={shot.via}>
                {(point, i) => {
                  const at = () => ({ x: point.x, y: playfield.height - point.y })
                  // The lane passes through the point, so the sample nearest
                  // it gives the way the lane heads there.
                  const through = () => {
                    const center = lane()?.center
                    if (!center?.length) return null
                    const p = at()
                    let best = center[0]
                    for (const q of center) {
                      if (Math.hypot(q.p.x - p.x, q.p.y - p.y) < Math.hypot(best.p.x - p.x, best.p.y - p.y)) best = q
                    }
                    return best.t
                  }
                  // A handle each side of the point, `side` 1 ahead and -1 behind.
                  const arm = (t: Point, side: number) => ({
                    x: at().x + side * DIRECTION_LENGTH * point.weight * t.x,
                    y: at().y + side * DIRECTION_LENGTH * point.weight * t.y,
                  })
                  const dragArm = (side: number) => (event: PointerEvent) =>
                    grab(shot, point.id, event, (p) => {
                      const t = through()
                      if (!t) return
                      const along = side * dot(svgFrom(p, at()), t)
                      moveVia(shot.id, point.id, { weight: roundWeight(along / DIRECTION_LENGTH) })
                    })
                  return (
                    <>
                      <Show when={isFocused(shot, point.id) && through()}>
                        {(t) => (
                          <>
                            <line
                              class="shot-via-direction"
                              x1={arm(t(), -1).x}
                              y1={arm(t(), -1).y}
                              x2={arm(t(), 1).x}
                              y2={arm(t(), 1).y}
                              vector-effect="non-scaling-stroke"
                            />
                            <For each={[-1, 1]}>
                              {(side) => (
                                <circle
                                  class="shot-handle shot-via-angle"
                                  cx={arm(t(), side).x}
                                  cy={arm(t(), side).y}
                                  r={DIRECTION_RADIUS}
                                  vector-effect="non-scaling-stroke"
                                  onPointerDown={dragArm(side)}
                                >
                                  <title>
                                    {shot.name} bend point {i() + 1} weight; the direction follows the points either side
                                  </title>
                                </circle>
                              )}
                            </For>
                          </>
                        )}
                      </Show>
                      <circle
                        class="shot-handle shot-via"
                        classList={{ 'is-focused': isFocused(shot, point.id) }}
                        cx={at().x}
                        cy={at().y}
                        r={VIA_RADIUS}
                        vector-effect="non-scaling-stroke"
                        onPointerDown={(e) =>
                          grab(shot, point.id, e, (p) => moveVia(shot.id, point.id, snapToPlayfield(p)))
                        }
                        onDblClick={() => removeVia(shot.id, point.id)}
                      >
                        <title>
                          {shot.name} bend point {i() + 1}: drag to move, double-click or Delete to remove, grab to bring
                          up its weight
                        </title>
                      </circle>
                    </>
                  )
                }}
              </For>
              <Show when={shot.end === 'double'}>
                <EndControls shot={shot} end="exit" focused={isFocused(shot, 'exit')} grab={grab} />
              </Show>
              <EndControls shot={shot} end="entrance" focused={isFocused(shot, 'entrance')} grab={grab} />
            </g>
          )
        }}
      </For>
    </g>
  )
}

/**
 * Handles for one end of a lane the ball is shot into: the end itself, and
 * while it's focused, its weight arm and its width, offset and lead-in sliders.
 * They all line up with the ball coming in, so they're left out while no
 * ball path reaches the lane.
 */
function EndControls(props: { shot: Shot; end: ShotEnd; focused: boolean; grab: Grab }) {
  const shot = props.shot
  const atEntrance = () => props.end === 'entrance'
  const lane = () => shotAnalyses().find((a) => a.id === shot.id)?.lane
  const point = () => {
    const p = atEntrance() ? shot.entrance : shot.exit
    return { x: p.x, y: playfield.height - p.y }
  }
  // Where the lane meets this end, with the way the ball heads into it there.
  const mouth = () => {
    const l = lane()
    if (!l?.center.length) return null
    if (atEntrance()) return l.center[0]
    const { sample } = laneExit(l)
    return { p: sample.p, t: { x: -sample.t.x, y: -sample.t.y } }
  }
  const width = () => (atEntrance() ? shot.entranceWidth : shot.exitWidth)
  // As the lane uses it: no further than its width now allows.
  const offset = () => fitOffset(atEntrance() ? shot.entranceOffset : shot.exitOffset, width())
  const leadIn = () => (atEntrance() ? shot.leadIn : shot.exitLeadIn)
  const weight = () => (atEntrance() ? shot.entranceWeight : shot.exitWeight)
  const pivot = () => (atEntrance() ? shot.entrancePivot : shot.exitPivot)
  // A double-ended lane's exit not lined up with any ball points the way it's
  // set, so its weight handle turns it too.
  const turns = () => !atEntrance() && !lane()?.exitLinedUp

  // Along the lane from where it meets this end, and `side` off to the right of travel.
  const fromMouth = (m: { p: Point; t: Point }, along: number, side = 0) => ({
    x: m.p.x + along * m.t.x + side * normal(m.t).x,
    y: m.p.y + along * m.t.y + side * normal(m.t).y,
  })
  // The curve takes this end's direction from where the lead-in ends.
  const leadInEnd = (m: { p: Point; t: Point }) => fromMouth(m, leadIn())
  const weightHandle = (m: { p: Point; t: Point }) => fromMouth(m, leadIn() + DIRECTION_LENGTH * weight())
  // Far enough to put the ball against either wall at the mouth, as the sidebar allows.
  const maxOffset = () => laneMaxOffset(width())
  // The offset slider runs across the mouth, back where the ball comes from
  // so it's clear of the end's handle; its handle sits level with where the lane meets the end.
  const offsetRail = (t: Point, at: number) => ({
    x: point().x - OFFSET_RAIL_BACK * t.x - at * normal(t).x,
    y: point().y - OFFSET_RAIL_BACK * t.y - at * normal(t).y,
  })
  // The lead-in slider runs alongside the lane, outside its right wall.
  const leadInSide = () => width() / 2 + LEAD_IN_RAIL_SIDE

  const grab = (event: PointerEvent, onMove: (p: Point) => void) => props.grab(shot, props.end, event, onMove)
  const dragEntrance = (event: PointerEvent) => grab(event, (p) => setEntrance(shot.id, snapToPlayfield(p)))
  const dragWeight = (event: PointerEvent) =>
    grab(event, (p) => {
      const m = mouth()
      if (!m) return
      if (turns()) {
        // Measured from the end, the way the ball comes in: the exit points back out.
        const d = svgFrom(p, point())
        if (Math.hypot(d.x, d.y) < 1e-6) return
        setExit(shot.id, { angle: Math.round((Math.atan2(d.y, -d.x) * 180) / Math.PI) })
        updateShot(shot.id, { exitWeight: roundWeight((Math.hypot(d.x, d.y) - leadIn()) / DIRECTION_LENGTH) })
        return
      }
      // The arm runs out from the middle of the mouth, which sits `offset`
      // across from where the ball crosses it: d = s·t − offset·normal(t),
      // `s` along the lane. Solve that for the direction `t` the arm points
      // to reach the pointer, and how far out along it the pointer is.
      const d = svgFrom(p, point())
      const o = offset()
      const reach = dot(d, d)
      if (reach <= o * o) return
      const s = Math.sqrt(reach - o * o)
      const t = { x: (s * d.x - o * d.y) / reach, y: (o * d.x + s * d.y) / reach }
      // Pivot from the ball's way in to that, counter-clockwise on screen.
      const ball = turnOnScreen(m.t, -pivot())
      const turned = (-Math.atan2(ball.x * t.y - ball.y * t.x, dot(ball, t)) * 180) / Math.PI
      const v = Math.abs(turned) < PIVOT_SNAP ? 0 : clamp(Math.round(turned / PIVOT_STEP) * PIVOT_STEP, -MAX_PIVOT, MAX_PIVOT)
      const w = roundWeight((s - leadIn()) / DIRECTION_LENGTH)
      updateShot(shot.id, atEntrance() ? { entranceWeight: w, entrancePivot: v } : { exitWeight: w, exitPivot: v })
    })
  const dragOffset = (event: PointerEvent) =>
    grab(event, (p) => {
      const m = mouth()
      if (!m) return
      const v = clamp(snap(-dot(svgFrom(p, point()), normal(m.t))), -maxOffset(), maxOffset())
      updateShot(shot.id, atEntrance() ? { entranceOffset: v } : { exitOffset: v })
    })
  // The width handle sits on the left wall at the mouth, opposite the lead-in slider.
  const dragWidth = (event: PointerEvent) =>
    grab(event, (p) => {
      const m = mouth()
      if (!m) return
      const v = clamp(snap(-2 * dot(svgFrom(p, m.p), normal(m.t))), MIN_WIDTH, MAX_WIDTH)
      updateShot(shot.id, atEntrance() ? { entranceWidth: v } : { exitWidth: v })
    })
  const dragLeadIn = (event: PointerEvent) =>
    grab(event, (p) => {
      const m = mouth()
      if (!m) return
      const v = clamp(snap(dot(svgFrom(p, m.p), m.t)), 0, MAX_LEAD_IN)
      updateShot(shot.id, atEntrance() ? { leadIn: v } : { exitLeadIn: v })
    })
  const name = () => (atEntrance() ? 'entrance' : 'exit')

  return (
    <>
      <Show when={props.focused && mouth()}>
        {(m) => (
          <>
            <line
              class="shot-entrance-rail"
              x1={offsetRail(m().t, -maxOffset()).x}
              y1={offsetRail(m().t, -maxOffset()).y}
              x2={offsetRail(m().t, maxOffset()).x}
              y2={offsetRail(m().t, maxOffset()).y}
              vector-effect="non-scaling-stroke"
            />
            <line
              class="shot-entrance-rail"
              x1={fromMouth(m(), 0, leadInSide()).x}
              y1={fromMouth(m(), 0, leadInSide()).y}
              x2={fromMouth(m(), MAX_LEAD_IN, leadInSide()).x}
              y2={fromMouth(m(), MAX_LEAD_IN, leadInSide()).y}
              vector-effect="non-scaling-stroke"
            />
            {/* Ties the lead-in handle to where the straight ends. */}
            <line
              class="shot-entrance-guide"
              x1={leadInEnd(m()).x}
              y1={leadInEnd(m()).y}
              x2={fromMouth(m(), leadIn(), leadInSide()).x}
              y2={fromMouth(m(), leadIn(), leadInSide()).y}
              vector-effect="non-scaling-stroke"
            />
            {/* Across the mouth, wall to wall. */}
            <line
              class="shot-entrance-guide"
              x1={fromMouth(m(), 0, width() / 2).x}
              y1={fromMouth(m(), 0, width() / 2).y}
              x2={fromMouth(m(), 0, -width() / 2).x}
              y2={fromMouth(m(), 0, -width() / 2).y}
              vector-effect="non-scaling-stroke"
            />
            <ArrowHandle
              class="shot-width-slider"
              at={fromMouth(m(), 0, -width() / 2)}
              along={normal(m().t)}
              onPointerDown={dragWidth}
              title={`${shot.name} ${name()} width: slide out or in to widen or narrow the lane`}
            />
            <ArrowHandle
              class="shot-entrance-slider"
              at={offsetRail(m().t, offset())}
              along={normal(m().t)}
              onPointerDown={dragOffset}
              title={`${shot.name} ${name()} offset: slide across to move the lane off where the ball enters`}
            />
            <ArrowHandle
              class="shot-entrance-slider"
              at={fromMouth(m(), leadIn(), leadInSide())}
              along={m().t}
              onPointerDown={dragLeadIn}
              title={`${shot.name} ${name()} straight lead-in: slide along to lengthen`}
            />
            <line
              class="shot-entrance-direction"
              x1={leadInEnd(m()).x}
              y1={leadInEnd(m()).y}
              x2={weightHandle(m()).x}
              y2={weightHandle(m()).y}
              vector-effect="non-scaling-stroke"
            />
            <circle
              class="shot-handle shot-entrance-angle"
              cx={weightHandle(m()).x}
              cy={weightHandle(m()).y}
              r={DIRECTION_RADIUS}
              vector-effect="non-scaling-stroke"
              onPointerDown={dragWeight}
            >
              <title>
                {shot.name} {name()}{' '}
                {turns()
                  ? 'direction and weight'
                  : 'weight and pivot: drag out for weight, swing around to turn the lane from the ball'}
              </title>
            </circle>
          </>
        )}
      </Show>
      {/* A double-ended lane's exit handle is drawn with the exit's others. */}
      <Show when={atEntrance()}>
        <circle
          class="shot-handle shot-entrance"
          cx={point().x}
          cy={point().y}
          r={HANDLE_RADIUS}
          vector-effect="non-scaling-stroke"
          onPointerDown={dragEntrance}
        >
          <title>{shot.name} entrance: grab to bring up its weight, offset and lead-in</title>
        </circle>
      </Show>
    </>
  )
}

// Half the length of a slider's double-headed arrow, the length of each head
// and half its width, and half the shaft's width, in inches.
const ARROW_REACH = 0.3
const ARROW_HEAD = 0.15
const ARROW_HEAD_SIDE = 0.15
const ARROW_SHAFT_SIDE = 0.065
// Pointing both ways along x, centered on the origin.
const ARROW_PATH = (() => {
  const [l, h, w, s] = [ARROW_REACH, ARROW_HEAD, ARROW_HEAD_SIDE, ARROW_SHAFT_SIDE]
  return `M ${-l} 0 L ${h - l} ${-w} L ${h - l} ${-s} L ${l - h} ${-s} L ${l - h} ${-w} L ${l} 0 L ${l - h} ${w} L ${l - h} ${s} L ${h - l} ${s} L ${h - l} ${w} Z`
})()

/**
 * A slider's handle: a double-headed arrow at `at` pointing either way along
 * `along`, the way it slides, so it reads apart from the round handles that
 * move freely or set a weight. Grabbed anywhere within its reach, not only on
 * its thin shaft.
 */
function ArrowHandle(props: {
  class: string
  at: Point
  along: Point
  onPointerDown: (event: PointerEvent) => void
  title: string
}) {
  const angle = () => (Math.atan2(props.along.y, props.along.x) * 180) / Math.PI
  return (
    <g
      class={`shot-handle shot-arrow ${props.class}`}
      transform={`translate(${props.at.x} ${props.at.y}) rotate(${angle()})`}
      onPointerDown={props.onPointerDown}
    >
      <circle class="shot-arrow-hit" r={ARROW_REACH} />
      <path d={ARROW_PATH} vector-effect="non-scaling-stroke" />
      {/* Here rather than passed in, so it's made as an SVG title. */}
      <title>{props.title}</title>
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
