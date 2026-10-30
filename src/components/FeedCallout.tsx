import { Show } from 'solid-js'
import { playfield } from '../state/playfield'
import { endName, shots } from '../state/shots'
import { laneExit, leavingExit, shotAnalyses } from '../state/solutions'
import { calledOutFeed } from '../state/view'
import type { Point } from '../geometry/flipper'

// Length of the arrow out of the called-out end, and of its head, inches.
const ARROW_LENGTH = 1.5
const HEAD_LENGTH = 0.35
// Gap past the arrow's tip to its label, inches.
const LABEL_GAP = 0.3

const points = (list: Point[]) => list.map((p) => `${p.x},${p.y}`).join(' ')

/**
 * The lane end pointed at in a list of ends to feed from: its lane traced
 * over, with an arrow out of the end the way the ball leaves. Must be
 * rendered inside the preview SVG.
 */
export default function FeedCallout() {
  const callout = () => {
    const feed = calledOutFeed()
    const shot = feed && shots.find((s) => s.id === feed.id)
    if (!feed || !shot) return null
    const lane = shotAnalyses().find((a) => a.id === shot.id)?.lane ?? null
    const { index } = lane ? laneExit(lane) : { index: 0 }
    const center = lane ? lane.center.slice(0, index + 1) : []
    // Out of the lane straight on from its end, back up it for a double-ended
    // lane left by its entrance.
    let at: Point
    let dir: Point
    if (lane && feed.end === 'exit') {
      at = center[index].p
      dir = center[index].t
    } else if (lane) {
      at = center[0].p
      dir = { x: -center[0].t.x, y: -center[0].t.y }
    } else {
      const exit = leavingExit(shot, feed.end)
      const angle = (exit.angle * Math.PI) / 180
      at = { x: exit.x, y: playfield.height - exit.y }
      dir = { x: Math.cos(angle), y: -Math.sin(angle) }
    }
    const tip = { x: at.x + dir.x * ARROW_LENGTH, y: at.y + dir.y * ARROW_LENGTH }
    const base = { x: tip.x - dir.x * HEAD_LENGTH, y: tip.y - dir.y * HEAD_LENGTH }
    const side = { x: -dir.y * HEAD_LENGTH * 0.5, y: dir.x * HEAD_LENGTH * 0.5 }
    return {
      center: center.map((c) => c.p),
      at,
      tip,
      head: [tip, { x: base.x + side.x, y: base.y + side.y }, { x: base.x - side.x, y: base.y - side.y }],
      label: { x: tip.x + dir.x * LABEL_GAP, y: tip.y + dir.y * LABEL_GAP },
      // Labels to the right of an arrow heading right, and so on.
      anchor: (dir.x > 0.3 ? 'start' : dir.x < -0.3 ? 'end' : 'middle') as 'start' | 'end' | 'middle',
      name: endName(shot, feed.end),
    }
  }

  return (
    <Show when={callout()}>
      {(c) => (
        <g class="feed-callout" pointer-events="none">
          <Show when={c().center.length > 1}>
            <polyline class="highlight-shape" points={points(c().center)} vector-effect="non-scaling-stroke" />
          </Show>
          <line
            class="highlight-shape"
            x1={c().at.x}
            y1={c().at.y}
            x2={c().tip.x}
            y2={c().tip.y}
            vector-effect="non-scaling-stroke"
          />
          <polygon class="dim-arrowhead" points={points(c().head)} />
          <text class="dim-label" x={c().label.x} y={c().label.y} text-anchor={c().anchor} dominant-baseline="middle">
            {c().name}
          </text>
        </g>
      )}
    </Show>
  )
}
