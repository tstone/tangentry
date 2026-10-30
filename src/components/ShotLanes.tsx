import { For, Show } from 'solid-js'
import { selectedId } from '../state/shots'
import { shotAnalyses } from '../state/solutions'
import type { Point } from '../geometry/flipper'

const points = (list: Point[]) => list.map((p) => `${p.x},${p.y}`).join(' ')

/** Lane walls and center line for every shot. Must be rendered inside the preview SVG. */
export default function ShotLanes() {
  return (
    <g class="shot-lanes">
      <For each={shotAnalyses()}>
        {(analysis) => (
          <Show when={analysis.lane}>
            {(lane) => (
              <g
                class="shot-lane"
                classList={{ 'is-selected': analysis.id === selectedId(), 'is-too-narrow': lane().tooNarrow }}
              >
                <polyline
                  class="shot-lane-center"
                  points={points(lane().center.map((q) => q.p))}
                  vector-effect="non-scaling-stroke"
                />
                <For each={lane().walls}>
                  {(wall) => (
                    <polyline class="shot-lane-wall" points={points(wall)} vector-effect="non-scaling-stroke" />
                  )}
                </For>
              </g>
            )}
          </Show>
        )}
      </For>
    </g>
  )
}
