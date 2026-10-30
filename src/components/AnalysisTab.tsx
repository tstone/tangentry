import { For, Show, onCleanup } from 'solid-js'
import { feedChain, otherEnd, selectedShot, type Shot } from '../state/shots'
import {
  BALL_STATES,
  OUTCOME_LABELS,
  selectedRuns,
  stateLabel,
  targetFlipper,
  type EndRun,
  type Solution,
} from '../state/solutions'
import { isHit } from '../geometry/lane'
import { isHovered, pathColor, setHoveredPath } from '../state/view'
import type { Departure } from '../physics/shot'
import { MAX_FLEX } from '../physics/wall'
import { clearLog, logEntries } from '../state/log'
import { formatDegrees, formatInches } from './Dimensions'

const DEPARTURE_LABELS: Record<Departure, string> = {
  tip: 'rolls off the tip',
  'stroke-end': 'leaves at end of stroke',
  'lift-off': 'lifts off mid-stroke',
}

const formatMs = (seconds: number) => `${Math.round(seconds * 1000)} ms`

function SolutionDetails(props: { solution: Solution }) {
  const s = () => props.solution
  return (
    <dl class="shot-solution">
      <dt>Fire at</dt>
      <dd>{formatInches(s().fireDistance)} along flipper</dd>
      <dt>Timing</dt>
      <dd>{formatMs(s().fireTime)} after reaching base</dd>
      <dt>Departs</dt>
      <dd>
        {formatDegrees(s().departureAngle)} at {Math.round(s().speed)} in/s
      </dd>
      <dt />
      <dd class="shot-solution-note">{DEPARTURE_LABELS[s().departureKind]}</dd>
      <Show when={s().lane}>
        {(run) => {
          const entrySpeed = () => Math.hypot(s().arrivalVelocity.x, s().arrivalVelocity.y)
          const hits = () => run().bounces.filter(isHit).length
          const maxFlex = () => Math.max(0, ...run().bounces.map((b) => b.flex))
          return (
            <>
              <dt>Lane</dt>
              <dd class="shot-outcome">{OUTCOME_LABELS[run().outcome]}</dd>
              <dt>First hit</dt>
              <Show
                when={run().bounces[0]}
                fallback={
                  <dd>
                    <Show when={run().firstTouch} fallback="never touches a wall">
                      {(t) => (
                        <>
                          settles onto wall {formatInches(t().distance)} in at {formatDegrees(t().impactAngle)}
                        </>
                      )}
                    </Show>
                  </dd>
                }
              >
                {(b) => (
                  <dd>
                    {formatInches(b().distance)} in at {formatDegrees(b().impactAngle)}, {Math.round(b().normalSpeed)}{' '}
                    in/s into wall, {Math.round(b().reboundSpeed)} in/s back off
                  </dd>
                )}
              </Show>
              <Show when={hits() > 1}>
                <dt>Hits</dt>
                <dd>{hits()}</dd>
              </Show>
              <Show when={maxFlex() > 0}>
                <dt>Wall flex</dt>
                <dd>
                  {formatInches(maxFlex())} at most
                  <Show when={maxFlex() > MAX_FLEX}>, over the {formatInches(MAX_FLEX)} limit</Show>
                </dd>
              </Show>
              <Show when={run().exitSpeed}>
                {(speed) => (
                  <>
                    <dt>Exits</dt>
                    <dd>
                      {Math.round(speed())} in/s ({Math.round((100 * speed()) / entrySpeed())}% of entry)
                    </dd>
                  </>
                )}
              </Show>
            </>
          )
        }}
      </Show>
    </dl>
  )
}

/** The ball paths into one end of a shot's lane. */
function ShotResults(props: { shot: Shot; run: EndRun }) {
  // The flipper the shot is made off comes first. A fed end's ball comes
  // off the flipper of the first lane feeding it, into its other end.
  const target = () => {
    const first = feedChain(props.shot, props.run.end)[0]
    return first ? targetFlipper(first.shot, otherEnd(first.leaves)) : targetFlipper(props.shot, props.run.end)
  }
  const ordered = () => {
    const all = props.run.flippers
    return [...all.filter((f) => f.key === target()), ...all.filter((f) => f.key !== target())]
  }
  return (
    <For each={ordered()}>
      {(flipper) => (
        <>
          <h4 class="sidebar-heading">
            {flipper.label}
            {flipper.key === target() ? ' · target' : ''}
          </h4>
          <For each={BALL_STATES.filter(({ state }) => state in flipper.states)}>
            {({ state }) => {
              // A block removed while hovered never sees the mouse leave.
              onCleanup(() => {
                if (isHovered(props.run.end, flipper.key, state)) setHoveredPath(null)
              })
              return (
                <div
                  class={`shot-state ${pathColor(state, flipper.states[state]).class}`}
                  classList={{ 'is-hovered': isHovered(props.run.end, flipper.key, state) }}
                  style={pathColor(state, flipper.states[state]).style}
                  onMouseEnter={() => setHoveredPath({ end: props.run.end, flipper: flipper.key, state })}
                  onMouseLeave={() => setHoveredPath(null)}
                >
                  <div class="shot-state-label">{stateLabel(flipper.key, state)}</div>
                  <Show
                    when={flipper.states[state]}
                    fallback={
                      <p class="shot-solution-none">
                        <Show when={flipper.blocked[state]} fallback={`No fire point reaches this ${props.run.end}.`}>
                          {(by) => <>Blocked by {by()}.</>}
                        </Show>
                      </p>
                    }
                  >
                    {(solution) => <SolutionDetails solution={solution()} />}
                  </Show>
                </div>
              )
            }}
          </For>
        </>
      )}
    </For>
  )
}

const timeOf = (t: Date) => t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** What's been done to the project this session, newest first. */
function Log() {
  const newestFirst = () => [...logEntries()].reverse()
  return (
    <section class="sidebar-section">
      <div class="shot-header">
        <h3 class="sidebar-heading">Log</h3>
        <button type="button" class="log-clear" disabled={logEntries().length === 0} onClick={clearLog}>
          Clear
        </button>
      </div>
      <Show when={logEntries().length > 0} fallback={<p class="field-note">Nothing done yet.</p>}>
        <ol class="log-list">
          <For each={newestFirst()}>
            {(entry) => (
              <li class="log-entry">
                <time class="log-time" dateTime={entry.time.toISOString()}>
                  {timeOf(entry.time)}
                </time>
                <span class="log-text">
                  <Show when={entry.color}>{(color) => <span class="log-swatch" style={{ background: color() }} />}</Show>
                  {entry.text}
                </span>
              </li>
            )}
          </For>
        </ol>
      </Show>
    </section>
  )
}

export default function AnalysisTab() {
  return (
    <>
      <section class="sidebar-section">
        <Show
          when={selectedShot()}
          fallback={<p class="field-note">Select a shot to see how the ball reaches and runs through it.</p>}
        >
          {(shot) => (
            <>
              <h3 class="sidebar-heading">{shot().name}</h3>
              <For each={selectedRuns()}>
                {(run) => (
                  <>
                    {/* A double-ended lane is shot into either end. */}
                    <Show when={shot().end === 'double'}>
                      <h3 class="sidebar-heading">Into the {run.end}</h3>
                    </Show>
                    <ShotResults shot={shot()} run={run} />
                  </>
                )}
              </For>
            </>
          )}
        </Show>
      </section>
      <Log />
    </>
  )
}
