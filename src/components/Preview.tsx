import { Index, createMemo } from 'solid-js'
import { playfield } from '../state/playfield'
import { centerDistance, contactBaseRadius, contactTipRadius, flippers } from '../state/flippers'
import { highlight } from '../state/highlight'
import { computeLayout } from '../state/layout'
import { flipperPath } from '../geometry/flipper'
import Annotations from './Annotations'
import { DimensionMarkers } from './Dimensions'
import PathColoringControl from './PathColoringControl'
import ShotLanes from './ShotLanes'
import ShotMarkers from './ShotMarkers'
import ShotPaths from './ShotPaths'

// Margin around the playfield, in inches (the SVG's user units).
const PADDING = 2

// Display radius of the flipper pivot marker, in inches.
const PIVOT_RADIUS = 0.1

export default function Preview() {
  const viewBox = () =>
    `${-PADDING} ${-PADDING} ${playfield.width + PADDING * 2} ${playfield.height + PADDING * 2}`

  const layout = createMemo(computeLayout)

  return (
    <div class="preview">
      <svg class="preview-canvas" viewBox={viewBox()} preserveAspectRatio="xMidYMid meet">
        <defs>
          <DimensionMarkers />
        </defs>
        <rect
          class="playfield"
          x={0}
          y={0}
          width={playfield.width}
          height={playfield.height}
          vector-effect="non-scaling-stroke"
        />
        <line
          class="center-line"
          x1={flippers.centerLine}
          x2={flippers.centerLine}
          y1={0}
          y2={playfield.height}
          vector-effect="non-scaling-stroke"
        />
        <g classList={{ 'is-dimmed': highlight() !== null }}>
          <Index each={layout().flippers}>
            {(f) => (
              <g>
                <line
                  class="inlane-guide"
                  x1={f().guide.start.x}
                  y1={f().guide.start.y}
                  x2={f().guide.end.x}
                  y2={f().guide.end.y}
                  vector-effect="non-scaling-stroke"
                />
                <path
                  class="flipper"
                  d={flipperPath(f().pivot, contactBaseRadius(), contactTipRadius(), centerDistance(), f().angle)}
                  vector-effect="non-scaling-stroke"
                />
                <path
                  class="flipper-insert"
                  d={flipperPath(f().pivot, flippers.baseRadius, flippers.tipRadius, centerDistance(), f().angle)}
                  vector-effect="non-scaling-stroke"
                />
                <circle
                  class="flipper-pivot"
                  cx={f().pivot.x}
                  cy={f().pivot.y}
                  r={PIVOT_RADIUS}
                  vector-effect="non-scaling-stroke"
                />
              </g>
            )}
          </Index>
        </g>
        <Annotations flippers={layout().flippers} />
        <ShotLanes />
        <ShotPaths />
        <ShotMarkers />
      </svg>
      <PathColoringControl />
    </div>
  )
}
