import { For } from 'solid-js'
import { ball } from '../state/ball'
import { safeTravelRegions } from '../state/safeTravel'
import type { Point } from '../geometry/flipper'

const points = (list: Point[]) => list.map((p) => `${p.x},${p.y}`).join(' ')

/**
 * Space the ball needs clear to make each shot and reach each shootable
 * reserved area. Must be rendered inside the preview SVG.
 */
export default function SafeTravel() {
  // Stroked a ball wide, so the region reaches the ball's edge rather than
  // its center. The group is faded as a whole so overlaps don't darken.
  return (
    <g class="safe-travel">
      <For each={safeTravelRegions()}>
        {(region) => <polygon class="safe-travel-region" points={points(region)} stroke-width={ball.diameter} />}
      </For>
    </g>
  )
}
