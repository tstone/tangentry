import { Index, Match, Switch } from 'solid-js'
import { highlight } from '../state/highlight'
import { playfield } from '../state/playfield'
import { centerDistance, contactBaseRadius, contactTipRadius, flippers } from '../state/flippers'
import { inlanes } from '../state/inlanes'
import { INLANE_LENGTH, toRadians, type FlipperLayout } from '../state/layout'
import { flipperPath, type Point } from '../geometry/flipper'
import { AngleDimension, Label, LinearDimension, formatDegrees, formatInches } from './Dimensions'

type Props = {
  flippers: FlipperLayout[]
}

const along = (p: Point, angle: number, distance: number): Point => ({
  x: p.x + distance * Math.cos(angle),
  y: p.y + distance * Math.sin(angle),
})

/** Callouts for whichever setting is hovered in the sidebar. */
export default function Annotations(props: Props) {
  const left = () => props.flippers[0]
  const right = () => props.flippers[1]

  // The line through each flipper that the inlane is aligned with.
  const alignmentLine = (f: FlipperLayout) => {
    const sx = f.side === 'left' ? 1 : -1
    const a = toRadians(inlanes.angle)
    const up = { x: sx * Math.sin(a), y: -Math.cos(a) }
    const offset =
      flippers.alignment === 'top' ? contactBaseRadius() : flippers.alignment === 'flopped' ? -contactBaseRadius() : 0
    const p = { x: f.pivot.x + up.x * offset, y: f.pivot.y + up.y * offset }
    return {
      start: along(p, f.inlaneAngle, -INLANE_LENGTH - 0.5),
      end: along(p, f.inlaneAngle, centerDistance() + contactTipRadius() + 1),
    }
  }

  const guides = () => (
    <Index each={props.flippers}>
      {(f) => (
        <line
          class="highlight-shape"
          x1={f().guide.start.x}
          y1={f().guide.start.y}
          x2={f().guide.end.x}
          y2={f().guide.end.y}
          vector-effect="non-scaling-stroke"
        />
      )}
    </Index>
  )

  return (
    <g class="annotations">
      <Switch>
        <Match when={highlight() === 'playfield.width'}>
          <LinearDimension a={{ x: 0, y: 0 }} b={{ x: playfield.width, y: 0 }} offset={-1} label={formatInches(playfield.width)} />
        </Match>

        <Match when={highlight() === 'playfield.height'}>
          <LinearDimension a={{ x: 0, y: playfield.height }} b={{ x: 0, y: 0 }} offset={-1} label={formatInches(playfield.height)} />
        </Match>

        <Match when={highlight() === 'playfield.angle'}>
          <rect
            class="highlight-shape"
            x={0}
            y={0}
            width={playfield.width}
            height={playfield.height}
            vector-effect="non-scaling-stroke"
          />
          <Label at={{ x: playfield.width / 2, y: -0.8 }} text={`${formatDegrees(playfield.angle)} incline`} />
        </Match>

        <Match when={highlight() === 'flippers.centerLine'}>
          <line
            class="highlight-shape"
            x1={flippers.centerLine}
            x2={flippers.centerLine}
            y1={0}
            y2={playfield.height}
            vector-effect="non-scaling-stroke"
          />
          <LinearDimension
            a={{ x: 0, y: playfield.height - 1 }}
            b={{ x: flippers.centerLine, y: playfield.height - 1 }}
            label={formatInches(flippers.centerLine)}
          />
        </Match>

        <Match when={highlight() === 'flippers.pivotFromBottom'}>
          <LinearDimension
            a={{ x: left().pivot.x, y: playfield.height }}
            b={left().pivot}
            offset={-(contactBaseRadius() + 0.8)}
            label={formatInches(flippers.pivotFromBottom)}
          />
        </Match>

        <Match when={highlight() === 'flippers.alignment'}>
          {guides()}
          <Index each={props.flippers}>
            {(f) => {
              const line = () => alignmentLine(f())
              return (
                <line
                  class="highlight-reference"
                  x1={line().start.x}
                  y1={line().start.y}
                  x2={line().end.x}
                  y2={line().end.y}
                  vector-effect="non-scaling-stroke"
                />
              )
            }}
          </Index>
        </Match>

        <Match when={highlight() === 'flippers.spacing' && flippers.spacingMode === 'pivots'}>
          <LinearDimension
            a={left().pivot}
            b={right().pivot}
            offset={-(contactBaseRadius() + 1)}
            label={formatInches(flippers.spacing)}
          />
        </Match>

        <Match when={highlight() === 'flippers.spacing' && flippers.spacingMode === 'tips'}>
          <LinearDimension
            a={{ x: left().tip.x + contactTipRadius(), y: left().tip.y }}
            b={{ x: right().tip.x - contactTipRadius(), y: right().tip.y }}
            offset={contactTipRadius() + 0.8}
            label={formatInches(flippers.spacing)}
          />
        </Match>

        <Match when={highlight() === 'flippers.baseRadius'}>
          <circle
            class="highlight-shape"
            cx={left().pivot.x}
            cy={left().pivot.y}
            r={flippers.baseRadius}
            vector-effect="non-scaling-stroke"
          />
          <LinearDimension
            a={left().pivot}
            b={along(left().pivot, (-3 * Math.PI) / 4, flippers.baseRadius)}
            arrows="end"
            label={formatInches(flippers.baseRadius)}
          />
        </Match>

        <Match when={highlight() === 'flippers.tipRadius'}>
          <circle
            class="highlight-shape"
            cx={left().tip.x}
            cy={left().tip.y}
            r={flippers.tipRadius}
            vector-effect="non-scaling-stroke"
          />
          <LinearDimension
            a={left().tip}
            b={along(left().tip, left().angle, flippers.tipRadius)}
            arrows="end"
            label={formatInches(flippers.tipRadius)}
          />
        </Match>

        <Match when={highlight() === 'flippers.length'}>
          <LinearDimension
            a={along(left().pivot, left().angle, -flippers.baseRadius)}
            b={along(left().tip, left().angle, flippers.tipRadius)}
            offset={-(contactBaseRadius() + 0.6)}
            label={formatInches(flippers.length)}
          />
        </Match>

        <Match when={highlight() === 'flippers.rubberThickness'}>
          <path
            class="highlight-shape"
            d={flipperPath(left().pivot, contactBaseRadius(), contactTipRadius(), centerDistance(), left().angle)}
            vector-effect="non-scaling-stroke"
          />
          <LinearDimension
            a={along(left().tip, left().angle, flippers.tipRadius)}
            b={along(left().tip, left().angle, contactTipRadius())}
            offset={contactTipRadius() + 0.6}
            label={formatInches(flippers.rubberThickness)}
          />
        </Match>

        <Match when={highlight() === 'flippers.strokeAngle'}>
          <Index each={props.flippers}>
            {(f) => {
              // Left flippers swing counter-clockwise on screen, right ones clockwise.
              const up = () => f().angle + (f().side === 'left' ? -1 : 1) * toRadians(flippers.strokeAngle)
              return (
                <>
                  <path
                    class="highlight-shape"
                    d={flipperPath(f().pivot, contactBaseRadius(), contactTipRadius(), centerDistance(), up())}
                    vector-effect="non-scaling-stroke"
                  />
                  <AngleDimension
                    center={f().pivot}
                    from={f().angle}
                    to={up()}
                    radius={centerDistance() + contactTipRadius() + 0.6}
                    label={formatDegrees(flippers.strokeAngle)}
                  />
                </>
              )
            }}
          </Index>
        </Match>

        <Match when={highlight() === 'inlanes.angle'}>
          {guides()}
          <Index each={props.flippers}>
            {(f) => (
              <AngleDimension
                center={f().guide.start}
                from={f().side === 'left' ? 0 : Math.PI}
                to={f().inlaneAngle}
                radius={1.5}
                label={formatDegrees(inlanes.angle)}
              />
            )}
          </Index>
        </Match>
      </Switch>
    </g>
  )
}
