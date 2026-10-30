import { For, Show, onCleanup } from 'solid-js'
import { playfield } from '../state/playfield'
import {
  extraFlippers,
  flipperFeed,
  moveExtraFlipper,
  PIVOT_SNAP,
  selectedFlipperId,
  setSelectedFlipperId,
  updateExtraFlipper,
  type ExtraFlipper,
} from '../state/extraFlippers'
import { flipperShape } from '../state/flippers'
import { extraFlipperLayout } from '../state/layout'
import { fedFlipperSettings, fedPivotToward, feedDistance, resolvedExtraFlipper } from '../state/solutions'
import { hoveredFlipper, setHoveredFlipper } from '../state/view'
import { flipperProfile } from '../physics/drive'
import { flipperPath } from '../geometry/flipper'
import { startDrag } from './drag'

// Display radius of an extra flipper's pivot handle, in inches.
const PIVOT_RADIUS = 0.16

/** Mouse handlers that mark an extra flipper hovered while the pointer is over it. */
export const flipperHoverHandlers = (id: number) => ({
  onPointerEnter: () => setHoveredFlipper(id),
  onPointerLeave: () => setHoveredFlipper((hovered) => (hovered === id ? null : hovered)),
})

function Body(props: { flipper: ExtraFlipper }) {
  const stock = () => flipperProfile(props.flipper.profile)
  const shape = () => flipperShape(stock())
  // A fed flipper points the way the ball comes out of the lane feeding it.
  const layout = () => extraFlipperLayout(resolvedExtraFlipper(props.flipper))
  // A ball rolling back out of a lane onto the flipper: its way down the
  // lane, then on across the playfield to where it crosses the flipper.
  const rollBack = () => {
    const f = props.flipper
    const fed = flipperFeed(f) ? fedFlipperSettings(f) : null
    const distance = feedDistance(f)
    if (!fed?.rollBack || distance === null) return null
    const { from, direction: d } = fed.line
    const onto = { x: from.x + d.x * distance, y: playfield.height - (from.y + d.y * distance) }
    return [...fed.rollBack.path, onto].map((p) => `${p.x},${p.y}`).join(' ')
  }
  return (
    <g
      class="extra-flipper"
      classList={{
        'is-hovered': hoveredFlipper() === props.flipper.id,
        'is-selected': selectedFlipperId() === props.flipper.id,
      }}
    >
      <Show when={rollBack()}>
        {(points) => <polyline class="extra-flipper-roll-back" points={points()} vector-effect="non-scaling-stroke" />}
      </Show>
      <path
        class="flipper"
        d={flipperPath(layout().pivot, shape().baseRadius, shape().tipRadius, shape().length, layout().angle)}
        vector-effect="non-scaling-stroke"
      />
      <path
        class="flipper-insert"
        d={flipperPath(layout().pivot, stock().baseRadius, stock().tipRadius, shape().length, layout().angle)}
        vector-effect="non-scaling-stroke"
      />
      <text class="extra-flipper-label" x={layout().pivot.x} y={layout().pivot.y - shape().baseRadius - 0.25}>
        {props.flipper.name}
      </text>
    </g>
  )
}

/** Outlines of the extra flippers at rest. Must be rendered inside the preview SVG. */
export default function ExtraFlippers() {
  return <For each={extraFlippers}>{(f) => <Body flipper={f} />}</For>
}

/**
 * A handle on each extra flipper's pivot to drag it around by. Must be
 * rendered inside the preview SVG, above the lanes.
 */
export function ExtraFlipperHandles() {
  return (
    <g class="extra-flipper-handles">
      <For each={extraFlippers}>
        {(f) => {
          onCleanup(() => {
            if (hoveredFlipper() === f.id) setHoveredFlipper(null)
          })
          const pivot = () => extraFlipperLayout(resolvedExtraFlipper(f)).pivot
          // Moves by how far the pointer goes, so grabbing off-center doesn't jump.
          const grab = (event: PointerEvent) => {
            const start = { ...resolvedExtraFlipper(f).pivot }
            let from: { x: number; y: number } | null = null
            const started = startDrag(event, (p) => {
              from ??= p
              const to = { x: start.x + p.x - from.x, y: start.y + p.y - from.y }
              // A fed flipper only slides along the way the ball comes out of the lane.
              const fed = fedPivotToward(f, to, PIVOT_SNAP)
              if (fed) updateExtraFlipper(f.id, { pivot: fed })
              else moveExtraFlipper(f.id, to)
            })
            if (started) setSelectedFlipperId(f.id)
          }
          return (
            <circle
              class="extra-flipper-handle"
              classList={{ 'is-hovered': hoveredFlipper() === f.id, 'is-selected': selectedFlipperId() === f.id }}
              cx={pivot().x}
              cy={pivot().y}
              r={PIVOT_RADIUS}
              vector-effect="non-scaling-stroke"
              {...flipperHoverHandlers(f.id)}
              onPointerDown={grab}
            >
              <title>
                {f.name}: {feedDistance(f) === null ? 'drag to move' : 'drag to slide along the lane feeding it'}
              </title>
            </circle>
          )
        }}
      </For>
    </g>
  )
}
