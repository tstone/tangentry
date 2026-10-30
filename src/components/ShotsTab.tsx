import { For, Show, batch } from 'solid-js'
import NumberField from './NumberField'
import CardName from './CardName'
import SelectField from './SelectField'
import SliderField from './SliderField'
import { playfield } from '../state/playfield'
import { ball } from '../state/ball'
import {
  HORSESHOE_RADIUS,
  HORSESHOE_ROTATION,
  addMount,
  fedBy,
  feedChain,
  linkShots,
  moveVia,
  removeMount,
  removeVia,
  removeOpenSpan,
  removeShot,
  renameShot,
  updateMount,
  selectedId,
  setEntrance,
  setExit,
  setFeed,
  setHorseshoe,
  setLaneEnd,
  setSelectedId,
  shots,
  unlinkShot,
  updateShot,
  type BallState,
  type Entrance,
  type FlipperKey,
  type LaneAlignment,
  type TargetFlipper,
  type LaneEnd,
  type Shot,
  type WallSide,
} from '../state/shots'
import {
  crossSide,
  shotAlignment,
  targetFlipper,
  BALL_STATES,
  WALL_SIDES,
  laneCrossings,
  laneOutlines,
  selectedAnalysis,
  stateLabel,
} from '../state/solutions'
import { extraFlipperKey, extraFlippers } from '../state/extraFlippers'
import type { Continuity } from '../geometry/lane'
import { MOUNT_KINDS, type MountKind } from '../physics/wall'
import { suggestMounts } from '../state/mountSuggestions'
import { reservedCrossedBy } from '../state/reserved'
import { formatDegrees, formatInches } from './Dimensions'
import { sketching } from '../state/sketch'
import { log } from '../state/log'

const CONTINUITY_OPTIONS: { label: string; value: Continuity }[] = [
  { label: 'G2 (curvature continuous)', value: 'g2' },
  { label: 'G1 (tangent arcs)', value: 'g1' },
]

/** Every flipper a shot can be made off; automatic names the one it picks for `entrance`. */
const flipperOptions = (entrance: Entrance): { label: string; value: TargetFlipper }[] => [
  { label: `Automatic (cross-field, ${crossSide(entrance)})`, value: 'auto' },
  { label: 'Left flipper', value: 'left' },
  { label: 'Right flipper', value: 'right' },
  ...extraFlippers.map((f) => ({ label: f.name, value: extraFlipperKey(f.id) })),
]

const BALL_STATE_OPTIONS: { label: string; value: BallState }[] = BALL_STATES.map(({ state, label }) => ({
  label,
  value: state,
}))

const MOUNT_OPTIONS: { label: string; value: MountKind }[] = MOUNT_KINDS.map((k) => ({ label: k.label, value: k.id }))

// Slider step, inches. Within a step of the far end counts as the end.
const STEP = 0.0625

const formatSigned = (inches: number) => (inches > 0 ? `+${formatInches(inches)}` : formatInches(inches))

function LaneNotes(props: { shot: Shot }) {
  const lane = () => selectedAnalysis()?.lane ?? null
  const label = (alignment: LaneAlignment) => {
    const [key, state] = alignment.split('-') as [FlipperKey, BallState]
    const flipper = selectedAnalysis()?.flippers.find((f) => f.key === key)
    return `${flipper?.label ?? key} · ${stateLabel(key, state).toLowerCase()}`
  }
  return (
    <Show
      when={lane()}
      fallback={<p class="shot-solution-none">No solved shot reaches the entrance, so there's no lane direction.</p>}
    >
      {(l) => (
        <>
          {/* Null for a fed lane, which has no alignment. */}
          <Show when={l().alignedTo !== shotAlignment(props.shot) && l().alignedTo}>
            {(alignedTo) => (
              <p class="shot-solution-none">That shot has no solution; lined up with {label(alignedTo())} instead.</p>
            )}
          </Show>
          <Show when={l().tooNarrow}>
            <p class="shot-solution-none">The lane is narrower than the ball.</p>
          </Show>
          <Show when={l().overRail > 0}>
            <p class="shot-solution-none">A wall runs {formatInches(l().overRail)} past the side rail.</p>
          </Show>
          <Show
            when={[...new Set(laneOutlines(l()).flatMap(reservedCrossedBy))]
              .map((a) => a.name || 'a custom mech')
              .join(', ')}
          >
            {(names) => <p class="shot-solution-none">The lane runs into {names()}.</p>}
          </Show>
          <Show when={laneCrossings().get(props.shot.id)?.map((s) => s.name || 'another lane').join(', ')}>
            {(names) => (
              <p class="shot-solution-none">The lane crosses {names()}. Only ramps can pass over other lanes.</p>
            )}
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
  const laneLength = () => selectedAnalysis()?.lane?.exitDistance ?? 0
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
      <p class="field-note">
        The lane passes through each point in order. Add them from the toolbar over the playfield; each goes midway
        along the longest stretch. Drag them there, and double-click one to remove it.
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

// A flipper to shoot from, or a lane feeding this one, chosen as `feed-${id}`.
type OriginChoice = TargetFlipper | `feed-${number}`

/**
 * Where the ball comes from: shot off a flipper, which the lane's entrance
 * lines up with, or out of another lane's exit.
 */
function OriginField(props: { shot: Shot }) {
  const chain = () => feedChain(props.shot)
  const options = (): { label: string; value: OriginChoice }[] => [
    ...flipperOptions(props.shot.entrance),
    // Not from a lane this one feeds, which would loop.
    ...shots
      .filter((s) => s.id !== props.shot.id && !feedChain(s).some((c) => c.id === props.shot.id))
      .map((s) => ({ label: `${s.name}'s exit`, value: `feed-${s.id}` as OriginChoice })),
  ]
  const value = (): OriginChoice => (chain().length > 0 ? `feed-${props.shot.feed!}` : props.shot.flipper)
  return (
    <>
      <SelectField
        label="Origin"
        options={options()}
        value={value()}
        onChange={(choice) => {
          if (choice === value()) return
          if (choice.startsWith('feed-')) {
            setFeed(props.shot.id, Number(choice.slice('feed-'.length)))
            return
          }
          batch(() => {
            if (props.shot.feed !== null) setFeed(props.shot.id, null)
            updateShot(props.shot.id, { flipper: choice as TargetFlipper })
          })
        }}
      />
      {/* An extra flipper's ball only rolls in. */}
      <Show when={chain().length === 0 && !targetFlipper(props.shot).startsWith('extra')}>
        <SelectField
          label="Ball arrives"
          options={BALL_STATE_OPTIONS}
          value={props.shot.ballState}
          onChange={(ballState) => updateShot(props.shot.id, { ballState })}
        />
      </Show>
      <Show when={chain().length > 0}>
        <p class="field-note">
          The ball leaves {chain().at(-1)!.name}'s exit and crosses open playfield into this lane, which starts out
          pointing straight from there. Its ball paths are the shots into {chain()[0].name}, run on through each lane.
        </p>
      </Show>
    </>
  )
}

// Joined lanes are chosen as `link-${id}`.
type LaneEndChoice = LaneEnd | `link-${number}`

/** Whether the lane ends open, in a horseshoe, or joined to another lane. */
function LaneEndField(props: { shot: Shot }) {
  const options = () => [
    { label: 'Open', value: 'open' as LaneEndChoice },
    { label: 'Horseshoe', value: 'horseshoe' as LaneEndChoice },
    ...shots
      .filter((s) => s.id !== props.shot.id)
      .map((s) => ({ label: `Joined to ${s.name}`, value: `link-${s.id}` as LaneEndChoice })),
  ]
  const value = (): LaneEndChoice => (props.shot.link === null ? props.shot.end : `link-${props.shot.link}`)
  return (
    <SelectField
      label="Lane exit"
      options={options()}
      value={value()}
      onChange={(choice) => {
        if (choice === value()) return
        if (choice.startsWith('link-')) linkShots(props.shot.id, Number(choice.slice('link-'.length)))
        else setLaneEnd(props.shot.id, choice as LaneEnd)
      }}
    />
  )
}

function HorseshoeFields(props: { shot: Shot }) {
  return (
    <>
      <SliderField
        label="Rotation"
        min={HORSESHOE_ROTATION.min}
        max={HORSESHOE_ROTATION.max}
        step={5}
        centered
        value={props.shot.horseshoe.rotation}
        format={(v) => formatDegrees(Math.abs(v))}
        ends={['turns right', 'turns left']}
        onChange={(rotation) => setHorseshoe(props.shot.id, { rotation })}
      />
      <SliderField
        label="Radius"
        min={HORSESHOE_RADIUS.min}
        max={HORSESHOE_RADIUS.max}
        value={props.shot.horseshoe.radius}
        format={formatInches}
        onChange={(radius) => setHorseshoe(props.shot.id, { radius })}
      />
      <p class="field-note">
        The lane carries on from the exit around a turn at the exit width; 180° heads back the way it came. Drag the
        horseshoe's center on the playfield to move it with the exit.
      </p>
    </>
  )
}

/** Stretches of the lane left without walls, as sketching makes them. */
function OpenSpans(props: { shot: Shot }) {
  const laneLength = () => selectedAnalysis()?.lane?.exitDistance ?? 0
  return (
    <Show when={props.shot.openSpans.length > 0}>
      <h4 class="sidebar-heading">Open spans</h4>
      <For each={props.shot.openSpans}>
        {(span, i) => (
          <div class="wall-mount-header">
            <span class="via-point-label">
              {formatInches(span.from * laneLength())} to {formatInches(span.to * laneLength())} from entrance
            </span>
            <button
              type="button"
              class="icon-button"
              aria-label={`Close open span ${i() + 1}`}
              title="Put the walls back"
              onClick={() => {
                removeOpenSpan(props.shot.id, i())
                log(`Put the walls back over an open span of ${props.shot.name}.`)
              }}
            >
              −
            </button>
          </div>
        )}
      </For>
      <p class="field-note">
        No walls here, leaving room for balls on their way to other shots. This lane's ball runs free across each
        span and has to land back between the walls.
      </p>
    </Show>
  )
}

function ShotCard(props: { shot: Shot }) {
  const selected = () => selectedId() === props.shot.id
  return (
    <section class="sidebar-section shot-card" classList={{ 'is-selected': selected() }}>
      <div class="shot-header">
        <CardName
          name={props.shot.name}
          selected={selected()}
          summary={
            selected() ? undefined : `${formatInches(props.shot.entrance.x)}, ${formatInches(props.shot.entrance.y)}`
          }
          onSelect={() => setSelectedId(props.shot.id)}
          onRename={(name) => renameShot(props.shot.id, name)}
        />
        <button
          type="button"
          class="icon-button"
          aria-label={`Remove ${props.shot.name}`}
          title="Remove shot"
          onClick={() => {
            log(`Removed ${props.shot.name}.`)
            removeShot(props.shot.id)
          }}
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
        <OriginField shot={props.shot} />
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

        <LaneEndField shot={props.shot} />
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
        <Show
          when={shots.find((s) => s.id === props.shot.link)}
          fallback={
            <Show
              when={props.shot.end === 'horseshoe'}
              fallback={
                <Show
                  when={fedBy(props.shot.id)}
                  fallback={
                    <p class="field-note">
                      Drag the exit or its direction handle onto another lane's exit to join the two into one lane, as
                      an orbit is.
                    </p>
                  }
                >
                  {(next) => (
                    <p class="field-note">
                      Feeds {next().name}: the ball leaves here and crosses open playfield into its entrance. Aim the
                      exit direction at it.
                    </p>
                  )}
                </Show>
              }
            >
              <HorseshoeFields shot={props.shot} />
            </Show>
          }
        >
          {(partner) => (
            <>
              <p class="field-note">
                Joined to {partner().name}: the ball runs on through its lane and out of its entrance. The exit and its
                width are shared; each lane's exit weight is its own side of the handle.
              </p>
              <button type="button" class="wall-mount-add" onClick={() => unlinkShot(props.shot.id)}>
                Separate lanes
              </button>
            </>
          )}
        </Show>

        <h4 class="sidebar-heading">Lane</h4>
        <label class="checkbox-field">
          <input
            type="checkbox"
            checked={props.shot.ramp}
            onChange={(e) => updateShot(props.shot.id, { ramp: e.currentTarget.checked })}
          />
          Ramp
        </label>
        <p class="field-note">A ramp can pass over other lanes; lanes on the playfield can't cross.</p>
        <OpenSpans shot={props.shot} />
        <SelectField
          label="Continuity"
          options={CONTINUITY_OPTIONS}
          value={props.shot.continuity}
          onChange={(continuity) => updateShot(props.shot.id, { continuity })}
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
          onClick={() => {
            suggestMounts(props.shot.id)
            log(`Suggested wall mounts for ${props.shot.name}.`)
          }}
        >
          + Suggest
        </button>
        <p class="field-note">
          Mounts at each end, then wherever a hit would flex the wall more than 0.03". Spade bolts, or spikes
          where a side rail or another wall leaves no room. Replaces the current mounts.
        </p>
      </Show>
    </section>
  )
}

export default function ShotsTab() {
  return (
    <>
      <div class="shots-toolbar">
        <h2 class="sidebar-heading">Shots</h2>
      </div>

      <Show when={sketching()}>
        <p class="field-note sketch-hint">
          Pick a color above the playfield and draw a lane, one color for each shot. Shots can't be edited while
          sketching. Finish fits a smooth lane to each color.
        </p>
      </Show>

      {/* Shots are locked while sketching. */}
      <div class="shot-list" classList={{ 'is-locked': sketching() }} inert={sketching()}>
        <Show when={shots.length > 0} fallback={<p class="sidebar-empty">No shots yet. Add or sketch one from the toolbar over the playfield.</p>}>
          <For each={shots}>{(shot) => <ShotCard shot={shot} />}</For>
        </Show>
      </div>
    </>
  )
}
