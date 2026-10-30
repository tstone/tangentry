import { For, Index, Show } from 'solid-js'
import { ball } from '../state/ball'
import { BALL_STATES, OUTCOME_LABELS, stateLabel, viewedRuns } from '../state/solutions'
import { hoveredPath, isHovered, pathColor, pathColoring, speedColor } from '../state/view'
import { flipperPath, type Point } from '../geometry/flipper'
import { isHit } from '../geometry/lane'

const points = (list: Point[]) => list.map((p) => `${p.x},${p.y}`).join(' ')

/** A line through `path` colored by speed, one segment at a time. */
function SpeedLine(props: { class: string; path: Point[]; speeds: number[] }) {
  return (
    <g class={props.class}>
      <Index each={props.path.slice(1)}>
        {(p, i) => (
          <line
            x1={props.path[i].x}
            y1={props.path[i].y}
            x2={p().x}
            y2={p().y}
            stroke={speedColor((props.speeds[i] + props.speeds[i + 1]) / 2)}
            vector-effect="non-scaling-stroke"
          />
        )}
      </Index>
    </g>
  )
}

/** A path drawn in the path color, or in a speed gradient when coloring by speed. */
function PathLine(props: { class: string; path: Point[]; speeds: number[] }) {
  return (
    <Show
      when={pathColoring() === 'speed'}
      fallback={<polyline class={props.class} points={points(props.path)} vector-effect="non-scaling-stroke" />}
    >
      <SpeedLine class={`${props.class} is-speed`} path={props.path} speeds={props.speeds} />
    </Show>
  )
}

/** Solved trajectories into the end in view of the selected shot. Must be rendered inside the preview SVG. */
export default function ShotPaths() {
  return (
    <g class="shot-paths" classList={{ 'has-hover': hoveredPath() !== null }}>
      <For each={viewedRuns().flatMap((run) => run.flippers.map((flipper) => ({ end: run.end, flipper })))}>
        {({ end, flipper }) => (
          <For each={BALL_STATES}>
            {({ state }) => (
              <Show when={flipper.states[state]}>
                {(s) => (
                  <g
                    class={`shot-path shot-path--${flipper.approach ?? 'extra'} ${pathColor(state, s()).class}`}
                    classList={{ 'is-hovered': isHovered(end, flipper.key, state) }}
                    style={pathColor(state, s()).style}
                  >
                    <title>
                      {flipper.label} · {stateLabel(flipper.key, state).toLowerCase()}
                      {s().lane ? `: ${OUTCOME_LABELS[s().lane!.outcome]}` : ''}
                    </title>
                    {/* Flipper at the moment the ball leaves it. */}
                    <path
                      class="shot-path-flipper"
                      d={flipperPath(
                        flipper.pivot,
                        flipper.shape.baseRadius,
                        flipper.shape.tipRadius,
                        flipper.shape.length,
                        s().flipperAngle,
                      )}
                      vector-effect="non-scaling-stroke"
                    />
                    <circle
                      class="shot-path-ball"
                      cx={s().fireBall.x}
                      cy={s().fireBall.y}
                      r={ball.diameter / 2}
                      vector-effect="non-scaling-stroke"
                    />
                    <PathLine class="shot-path-ride" path={s().ride} speeds={s().rideSpeeds} />
                    <PathLine class="shot-path-flight" path={s().flight} speeds={s().flightSpeeds} />
                    <circle class="shot-path-departure" cx={s().departure.x} cy={s().departure.y} r={0.08} />
                    <Show when={s().lane}>
                      {(run) => (
                        <>
                          {/* Ball continuing up the lane, bouncing off the walls. */}
                          <PathLine class="shot-path-flight" path={run().path} speeds={run().speeds} />
                          <Show when={run().bounces[0] ?? run().firstTouch}>
                            {(c) => (
                              <circle
                                class="shot-path-ball"
                                cx={c().ball.x}
                                cy={c().ball.y}
                                r={ball.diameter / 2}
                                vector-effect="non-scaling-stroke"
                              />
                            )}
                          </Show>
                          <For each={run().bounces}>
                            {(b) => (
                              <circle
                                class="shot-path-contact"
                                classList={{ 'is-hit': isHit(b) }}
                                cx={b.wall.x}
                                cy={b.wall.y}
                                r={isHit(b) ? 0.12 : 0.06}
                              />
                            )}
                          </For>
                        </>
                      )}
                    </Show>
                  </g>
                )}
              </Show>
            )}
          </For>
        )}
      </For>
    </g>
  )
}
