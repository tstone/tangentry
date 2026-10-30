import { For, Show, onCleanup } from 'solid-js'
import NumberField from './NumberField'
import SelectField from './SelectField'
import SliderField from './SliderField'
import { playfield } from '../state/playfield'
import { ball } from '../state/ball'
import {
  addMount,
  addShot,
  moveVia,
  removeMount,
  removeVia,
  removeShot,
  updateMount,
  selectedId,
  setEntrance,
  setExit,
  setSelectedId,
  shots,
  updateShot,
  type LaneAlignment,
  type Shot,
  type WallSide,
} from '../state/shots'
import {
  APPROACHES,
  BALL_STATES,
  OUTCOME_LABELS,
  WALL_SIDES,
  selectedAnalysis,
  selectedSolutions,
  type Solution,
} from '../state/solutions'
import { HIT_SEVERITY, type Continuity } from '../geometry/lane'
import { isHovered, pathColor, setHoveredPath } from '../state/view'
import type { Departure } from '../physics/shot'
import { MOUNT_KINDS, type MountKind } from '../physics/wall'
import { suggestMounts } from '../state/mountSuggestions'
import { insertVia } from '../state/viaPoints'
import { formatDegrees, formatInches } from './Dimensions'

const DEPARTURE_LABELS: Record<Departure, string> = {
  tip: 'rolls off the tip',
  'stroke-end': 'leaves at end of stroke',
  'lift-off': 'lifts off mid-stroke',
}

const CONTINUITY_OPTIONS: { label: string; value: Continuity }[] = [
  { label: 'G2 (curvature continuous)', value: 'g2' },
  { label: 'G1 (tangent arcs)', value: 'g1' },
]

const ALIGNMENT_OPTIONS: { label: string; value: LaneAlignment }[] = APPROACHES.flatMap(({ approach, label }) =>
  BALL_STATES.map((state) => ({
    label: `${label} · ${state.label.toLowerCase()}`,
    value: `${approach}-${state.state}` as LaneAlignment,
  })),
)

const formatMs = (seconds: number) => `${Math.round(seconds * 1000)} ms`

const MOUNT_OPTIONS: { label: string; value: MountKind }[] = MOUNT_KINDS.map((k) => ({ label: k.label, value: k.id }))

// Slider step, inches. Within a step of the far end counts as the end.
const STEP = 0.0625

const formatSigned = (inches: number) => (inches > 0 ? `+${formatInches(inches)}` : formatInches(inches))

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
          const hits = () => run().bounces.filter((b) => b.reboundSpeed >= HIT_SEVERITY.chatter).length
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

function ShotResults() {
  return (
    <For each={selectedSolutions()}>
      {(flipper) => (
        <>
          <h4 class="sidebar-heading">
            {APPROACHES.find((a) => a.approach === flipper.approach)!.label} · {flipper.side} flipper
          </h4>
          <For each={BALL_STATES}>
            {({ state, label }) => {
              // A block removed while hovered never sees the mouse leave.
              onCleanup(() => {
                if (isHovered(flipper.approach, state)) setHoveredPath(null)
              })
              return (
                <div
                  class={`shot-state ${pathColor(state, flipper.states[state]).class}`}
                  classList={{ 'is-hovered': isHovered(flipper.approach, state) }}
                  style={pathColor(state, flipper.states[state]).style}
                  onMouseEnter={() => setHoveredPath({ approach: flipper.approach, state })}
                  onMouseLeave={() => setHoveredPath(null)}
                >
                  <div class="shot-state-label">{label}</div>
                  <Show
                    when={flipper.states[state]}
                    fallback={<p class="shot-solution-none">No fire point reaches this entrance.</p>}
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

function LaneNotes(props: { shot: Shot }) {
  const lane = () => selectedAnalysis()?.lane ?? null
  const label = (alignment: LaneAlignment) => ALIGNMENT_OPTIONS.find((o) => o.value === alignment)!.label
  return (
    <Show
      when={lane()}
      fallback={<p class="shot-solution-none">No solved shot reaches the entrance, so there's no lane direction.</p>}
    >
      {(l) => (
        <>
          <Show when={l().alignedTo !== props.shot.alignment}>
            <p class="shot-solution-none">That shot has no solution; lined up with {label(l().alignedTo)} instead.</p>
          </Show>
          <Show when={l().tooNarrow}>
            <p class="shot-solution-none">The lane is narrower than the ball.</p>
          </Show>
          <Show when={l().overRail > 0}>
            <p class="shot-solution-none">A wall runs {formatInches(l().overRail)} past the side rail.</p>
          </Show>
          <p class="shot-solution-note">
            <Show when={Number.isFinite(l().tightest.radius)} fallback="Straight lane">
              Tightest radius {formatInches(l().tightest.radius)}, {formatInches(l().tightest.distance)} into lane
            </Show>
          </p>
          <Show when={l().tightest.radius < Math.max(props.shot.entranceWidth, props.shot.exitWidth) / 2}>
            <p class="shot-solution-none">The bend is tighter than half the lane width, so the inner wall folds over.</p>
          </Show>
          <Show when={props.shot.continuity === 'g1'}>
            <p class="shot-solution-note">G1 uses only the ratio of the two weights.</p>
          </Show>
        </>
      )}
    </Show>
  )
}

function LaneShaping(props: { shot: Shot }) {
  // Far enough to put the ball against either wall at the mouth.
  const maxOffset = () => Math.max(0, props.shot.entranceWidth / 2 - ball.diameter / 2)
  const laneLength = () => selectedAnalysis()?.lane?.center.at(-1)?.s ?? 0
  return (
    <>
      <SliderField
        label="Entrance offset"
        min={-maxOffset()}
        max={maxOffset()}
        centered
        value={props.shot.entranceOffset}
        format={formatSigned}
        ends={['ball nearer left wall', 'nearer right wall']}
        onChange={(entranceOffset) => updateShot(props.shot.id, { entranceOffset })}
      />
      <SliderField
        label="Straight lead-in"
        min={0}
        max={8}
        value={props.shot.leadIn}
        format={formatInches}
        onChange={(leadIn) => updateShot(props.shot.id, { leadIn })}
      />
      <SliderField
        label="Funnel length"
        min={0}
        step={STEP}
        max={Math.max(laneLength(), 0.01)}
        value={props.shot.funnelLength}
        format={(v) => (v >= laneLength() - STEP ? 'whole lane' : formatInches(v))}
        // The far end of the track means the whole lane, however long it gets.
        onChange={(v) => updateShot(props.shot.id, { funnelLength: v >= laneLength() - STEP ? Infinity : v })}
      />
      <p class="field-note">
        Distance over which the lane narrows from {formatInches(props.shot.entranceWidth)} to{' '}
        {formatInches(props.shot.exitWidth)}.
      </p>
    </>
  )
}

/** Points the lane passes through between its entrance and exit. */
function ViaPoints(props: { shot: Shot }) {
  return (
    <>
      <h4 class="sidebar-heading">Bend points</h4>
      <For each={props.shot.via}>
        {(point, i) => (
          <div class="wall-mount">
            <div class="wall-mount-header">
              <span class="via-point-label">Point {i() + 1}</span>
              <button
                type="button"
                class="icon-button"
                aria-label={`Remove bend point ${i() + 1}`}
                title="Remove bend point"
                onClick={() => removeVia(props.shot.id, point.id)}
              >
                −
              </button>
            </div>
            <div class="field-pair">
              <NumberField
                label="X"
                unit="in"
                min={0}
                max={playfield.width}
                step={0.125}
                value={point.x}
                onChange={(x) => moveVia(props.shot.id, point.id, { x })}
              />
              <NumberField
                label="Y"
                unit="in"
                min={0}
                max={playfield.height}
                step={0.125}
                value={point.y}
                onChange={(y) => moveVia(props.shot.id, point.id, { y })}
              />
            </div>
          </div>
        )}
      </For>
      <button type="button" class="wall-mount-add" onClick={() => insertVia(props.shot.id)}>
        + Add bend point
      </button>
      <p class="field-note">
        The lane passes through each point in order. New points go midway along the longest stretch; drag them on the
        playfield. Double-click a point there to remove it.
      </p>
    </>
  )
}

function WallMounts(props: { shot: Shot; side: WallSide; label: string }) {
  const length = () => selectedAnalysis()?.lane?.walls.find((w) => w.side === props.side)?.lengths.at(-1) ?? 0
  return (
    <>
      <h4 class="sidebar-heading">{props.label} mounts</h4>
      <For each={props.shot.mounts[props.side]}>
        {(mount, i) => (
          <div class="wall-mount">
            <div class="wall-mount-header">
              <SelectField
                label={`Mount ${i() + 1}`}
                options={MOUNT_OPTIONS}
                value={mount.kind}
                onChange={(kind) => updateMount(props.shot.id, props.side, mount.id, { kind })}
              />
              <button
                type="button"
                class="icon-button"
                aria-label={`Remove mount ${i() + 1}`}
                title="Remove mount"
                onClick={() => removeMount(props.shot.id, props.side, mount.id)}
              >
                −
              </button>
            </div>
            <SliderField
              label="From entrance"
              min={0}
              max={Math.max(length(), 0.01)}
              step={0.01}
              value={mount.at * length()}
              format={formatInches}
              onChange={(d) => length() > 0 && updateMount(props.shot.id, props.side, mount.id, { at: d / length() })}
            />
          </div>
        )}
      </For>
      <Show when={props.shot.mounts[props.side].length === 0}>
        <p class="shot-solution-none">Nothing holds this wall; it only rests on the playfield.</p>
      </Show>
      <button type="button" class="wall-mount-add" onClick={() => addMount(props.shot.id, props.side)}>
        + Add mount
      </button>
    </>
  )
}

function ShotCard(props: { shot: Shot }) {
  const selected = () => selectedId() === props.shot.id
  return (
    <section class="sidebar-section shot-card" classList={{ 'is-selected': selected() }}>
      <div class="shot-header">
        <button
          type="button"
          class="shot-select"
          aria-pressed={selected()}
          onClick={() => setSelectedId(props.shot.id)}
        >
          <span class="shot-name">{props.shot.name}</span>
          <Show when={!selected()}>
            <span class="shot-summary">
              {formatInches(props.shot.entrance.x)}, {formatInches(props.shot.entrance.y)}
            </span>
          </Show>
        </button>
        <button
          type="button"
          class="icon-button"
          aria-label={`Remove ${props.shot.name}`}
          title="Remove shot"
          onClick={() => removeShot(props.shot.id)}
        >
          −
        </button>
      </div>
      <Show when={selected()}>
        <h4 class="sidebar-heading">Entrance</h4>
        <div class="field-pair">
          <NumberField
            label="X"
            unit="in"
            min={0}
            max={playfield.width}
            step={0.125}
            value={props.shot.entrance.x}
            onChange={(x) => setEntrance(props.shot.id, { x })}
          />
          <NumberField
            label="Y"
            unit="in"
            min={0}
            max={playfield.height}
            step={0.125}
            value={props.shot.entrance.y}
            onChange={(y) => setEntrance(props.shot.id, { y })}
          />
        </div>
        <NumberField
          label="Width"
          unit="in"
          min={0.25}
          max={10}
          step={0.0625}
          value={props.shot.entranceWidth}
          onChange={(entranceWidth) => updateShot(props.shot.id, { entranceWidth })}
        />
        <LaneShaping shot={props.shot} />

        <ViaPoints shot={props.shot} />

        <h4 class="sidebar-heading">Exit</h4>
        <div class="field-pair">
          <NumberField
            label="X"
            unit="in"
            min={0}
            max={playfield.width}
            step={0.125}
            value={props.shot.exit.x}
            onChange={(x) => setExit(props.shot.id, { x })}
          />
          <NumberField
            label="Y"
            unit="in"
            min={0}
            max={playfield.height}
            step={0.125}
            value={props.shot.exit.y}
            onChange={(y) => setExit(props.shot.id, { y })}
          />
        </div>
        <NumberField
          label="Direction"
          unit="°"
          min={-180}
          max={180}
          step={1}
          value={props.shot.exit.angle}
          onChange={(angle) => setExit(props.shot.id, { angle })}
        />
        <NumberField
          label="Width"
          unit="in"
          min={0.25}
          max={10}
          step={0.0625}
          value={props.shot.exitWidth}
          onChange={(exitWidth) => updateShot(props.shot.id, { exitWidth })}
        />

        <h4 class="sidebar-heading">Lane</h4>
        <SelectField
          label="Continuity"
          options={CONTINUITY_OPTIONS}
          value={props.shot.continuity}
          onChange={(continuity) => updateShot(props.shot.id, { continuity })}
        />
        <SelectField
          label="Entrance lined up with"
          options={ALIGNMENT_OPTIONS}
          value={props.shot.alignment}
          onChange={(alignment) => updateShot(props.shot.id, { alignment })}
        />
        <NumberField
          label="Entrance weight"
          unit="×"
          min={0.1}
          max={5}
          step={0.05}
          value={props.shot.entranceWeight}
          onChange={(entranceWeight) => updateShot(props.shot.id, { entranceWeight })}
        />
        <NumberField
          label="Exit weight"
          unit="×"
          min={0.1}
          max={5}
          step={0.05}
          value={props.shot.exitWeight}
          onChange={(exitWeight) => updateShot(props.shot.id, { exitWeight })}
        />
        <LaneNotes shot={props.shot} />

        <details class="wall-mounts">
          <summary class="sidebar-heading">
            Wall mounts ({props.shot.mounts.left.length + props.shot.mounts.right.length})
          </summary>
          <div class="wall-mounts-body">
            <For each={WALL_SIDES}>
              {({ side, label }) => <WallMounts shot={props.shot} side={side} label={label} />}
            </For>
          </div>
        </details>
        <button
          type="button"
          class="wall-mount-add"
          title="Replace both walls' mounts with ones placed for this shot's hits"
          onClick={() => suggestMounts(props.shot.id)}
        >
          + Suggest
        </button>
        <p class="field-note">
          Mounts at each end, then wherever a hit would flex the wall more than 0.03". Spade bolts, or spikes
          where a side rail or another wall leaves no room. Replaces the current mounts.
        </p>

        <ShotResults />
      </Show>
    </section>
  )
}

export default function ShotsTab() {
  return (
    <>
      <div class="shots-toolbar">
        <h2 class="sidebar-heading">Shots</h2>
        <button type="button" class="icon-button" aria-label="Add shot" title="Add shot" onClick={() => addShot()}>
          +
        </button>
      </div>

      <Show when={shots.length > 0} fallback={<p class="sidebar-empty">No shots yet. Click + to add one.</p>}>
        <For each={shots}>{(shot) => <ShotCard shot={shot} />}</For>
      </Show>
    </>
  )
}
