import { For, Show, batch } from 'solid-js'
import NumberField from './NumberField'
import CardName from './CardName'
import SelectField from './SelectField'
import SliderField from './SliderField'
import { playfield } from '../state/playfield'
import {
  HORSESHOE_RADIUS,
  HORSESHOE_ROTATION,
  addMount,
  canLeaveBy,
  endPoint,
  endName,
  fedBy,
  feedChain,
  feedLoops,
  moveVia,
  originOf,
  otherEnd,
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
  setShotType,
  shotType,
  type ShotType,
  setOrigin,
  setSelectedId,
  shots,
  updateShot,
  type BallState,
  type Entrance,
  type FlipperKey,
  type LaneAlignment,
  type TargetFlipper,
  type LaneEnd,
  type Shot,
  type ShotEnd,
  type WallSide,
} from '../state/shots'
import {
  crossSide,
  shotAlignment,
  fitOffset,
  maxOffset as laneMaxOffset,
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
  const flipperLabel = (alignment: LaneAlignment, end: ShotEnd) => {
    const key = alignment.split('-')[0] as FlipperKey
    const run = selectedAnalysis()?.runs.find((r) => r.end === end)
    return run?.flippers.find((f) => f.key === key)?.label ?? key
  }
  const label = (alignment: LaneAlignment, end: ShotEnd) => {
    const [key, state] = alignment.split('-') as [FlipperKey, BallState]
    return `${flipperLabel(alignment, end)} · ${stateLabel(key, state).toLowerCase()}`
  }
  const double = () => props.shot.end === 'double'
  return (
    <Show
      when={lane()}
      fallback={<p class="shot-solution-none">No solved shot reaches the entrance, so there's no lane direction.</p>}
    >
      {(l) => (
        <>
          {/* Null for a fed end, which has no alignment. */}
          <Show when={l().alignedTo !== shotAlignment(props.shot) && l().alignedTo}>
            {(alignedTo) => (
              <p class="shot-solution-none">
                That shot{double() ? ' into the entrance' : ''} has no solution; lined up with{' '}
                {label(alignedTo(), 'entrance')} instead.
              </p>
            )}
          </Show>
          <Show when={!l().reached && l().alignedTo}>
            {(alignedTo) => (
              <p class="shot-solution-none">
                No shot off {flipperLabel(alignedTo(), 'entrance')} reaches the{double() ? ' entrance' : ' lane'}, so
                it points straight from that flipper.
              </p>
            )}
          </Show>
          <Show when={double() && !l().exitReached && l().exitAlignedTo}>
            {(alignedTo) => (
              <p class="shot-solution-none">
                No shot off {flipperLabel(alignedTo(), 'exit')} reaches the exit, so it points straight from that
                flipper.
              </p>
            )}
          </Show>
          <Show when={double() && !l().exitLinedUp}>
            <p class="shot-solution-none">
              No solved shot reaches the exit, so it points the way it's set instead of lining up with the ball.
            </p>
          </Show>
          <Show when={double() && l().exitAlignedTo !== shotAlignment(props.shot, 'exit') && l().exitAlignedTo}>
            {(alignedTo) => (
              <p class="shot-solution-none">
                That shot into the exit has no solution; lined up with {label(alignedTo(), 'exit')} instead.
              </p>
            )}
          </Show>
          <For each={double() ? (['entrance', 'exit'] as const) : (['entrance'] as const)}>
            {(end) => {
              const alignedTo = () => (end === 'entrance' ? l().alignedTo : l().exitAlignedTo)
              const splitWith = () => (end === 'entrance' ? l().splitWith : l().exitSplitWith)
              const where = double() ? ` the ${end}` : ''
              return (
                <Show when={originOf(props.shot, end).split && feedChain(props.shot, end).length === 0 && alignedTo()}>
                  {(a) => (
                    <Show
                      when={splitWith()}
                      fallback={
                        <p class="shot-solution-none">
                          No matching shot off the other flipper reaches{where || ' the lane'}, so it lines up with{' '}
                          {label(a(), end)} alone.
                        </p>
                      }
                    >
                      {(b) => (
                        <p class="shot-solution-note">
                          Lined up{where && ` at${where}`} midway between {flipperLabel(a(), end)} and{' '}
                          {flipperLabel(b(), end)}.
                        </p>
                      )}
                    </Show>
                  )}
                </Show>
              )
            }}
          </For>
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

// Furthest a lane end pivots from the ball, degrees, either way.
const PIVOT_RANGE = 45

/** How far one end of the lane turns from the way the ball comes into it. */
function PivotField(props: { value: number; onChange: (pivot: number) => void }) {
  return (
    <>
      <SliderField
        label="Pivot"
        min={-PIVOT_RANGE}
        max={PIVOT_RANGE}
        step={0.5}
        centered
        value={props.value}
        format={(v) => formatDegrees(Math.abs(v))}
        ends={['clockwise', 'counter-clockwise']}
        onChange={props.onChange}
      />
      <p class="field-note">
        Turns the lane from the ball's line about where the ball crosses the mouth, so the ball comes in at an angle,
        as into an orbit that follows the side rail.
      </p>
    </>
  )
}

function LaneShaping(props: { shot: Shot }) {
  // Far enough to put the ball against either wall at the mouth.
  const maxOffset = () => laneMaxOffset(props.shot.entranceWidth)
  const laneLength = () => selectedAnalysis()?.lane?.exitDistance ?? 0
  return (
    <>
      <SliderField
        label="Entrance offset"
        min={-maxOffset()}
        max={maxOffset()}
        centered
        value={fitOffset(props.shot.entranceOffset, props.shot.entranceWidth)}
        format={formatSigned}
        ends={['ball nearer left wall', 'nearer right wall']}
        onChange={(entranceOffset) => updateShot(props.shot.id, { entranceOffset })}
      />
      <PivotField
        value={props.shot.entrancePivot}
        onChange={(entrancePivot) => updateShot(props.shot.id, { entrancePivot })}
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

// Whether a lane end lines up with the ball path off its flipper, or
// midway between that and the same shot off the other main flipper.
const LINE_UP_OPTIONS: { label: string; value: 'path' | 'split' }[] = [
  { label: "This flipper's ball path", value: 'path' },
  { label: 'Split between both flippers', value: 'split' },
]

// A flipper to shoot from, or a lane end feeding this one, chosen as
// `feed-${id}-${end}`.
type OriginChoice = TargetFlipper | `feed-${number}-${ShotEnd}`

/**
 * Where the ball comes into one end of the lane from: shot off a flipper,
 * which that end lines up with, or out of another lane's end.
 */
function OriginField(props: { shot: Shot; end: ShotEnd }) {
  const origin = () => originOf(props.shot, props.end)
  const chain = () => feedChain(props.shot, props.end)
  const options = (): { label: string; value: OriginChoice }[] => [
    ...flipperOptions(endPoint(props.shot, props.end)),
    // Any lane's exit, and either end of a double-ended lane, but not a
    // lane this one feeds, which would loop.
    ...shots.flatMap((s) =>
      (['exit', 'entrance'] as const)
        .filter((end) => (end === 'exit' || canLeaveBy(s, end)) && !feedLoops(props.shot.id, { id: s.id, end }))
        .map((end) => ({ label: endName(s, end), value: `feed-${s.id}-${end}` as OriginChoice })),
    ),
  ]
  const value = (): OriginChoice => {
    const feed = origin().feed
    return chain().length > 0 && feed ? `feed-${feed.id}-${feed.end}` : origin().flipper
  }
  return (
    <>
      <SelectField
        label="Origin"
        options={options()}
        value={value()}
        onChange={(choice) => {
          if (choice === value()) return
          if (choice.startsWith('feed-')) {
            const [, id, end] = choice.split('-')
            setFeed(props.shot.id, props.end, { id: Number(id), end: end as ShotEnd })
            return
          }
          batch(() => {
            if (origin().feed !== null) setFeed(props.shot.id, props.end, null)
            setOrigin(props.shot.id, props.end, { flipper: choice as TargetFlipper })
          })
        }}
      />
      {/* An extra flipper's ball only rolls in. */}
      <Show when={chain().length === 0 && !targetFlipper(props.shot, props.end).startsWith('extra')}>
        <SelectField
          label="Ball arrives"
          options={BALL_STATE_OPTIONS}
          value={origin().ballState}
          onChange={(ballState) => setOrigin(props.shot.id, props.end, { ballState })}
        />
        <SelectField
          label="Line up with"
          options={LINE_UP_OPTIONS}
          value={origin().split ? 'split' : 'path'}
          onChange={(choice) => setOrigin(props.shot.id, props.end, { split: choice === 'split' })}
        />
      </Show>
      <Show when={chain().length > 0}>
        <p class="field-note">
          The ball leaves {endName(chain().at(-1)!.shot, chain().at(-1)!.leaves)} and crosses open playfield into this
          lane, which starts out pointing straight from there. Its ball paths are the shots into{' '}
          {props.shot.end === 'double' || chain()[0].shot.end === 'double'
            ? endName(chain()[0].shot, otherEnd(chain()[0].leaves))
            : chain()[0].shot.name}
          , run on through each lane.
        </p>
      </Show>
    </>
  )
}

/** The lanes fed from one end of a shot's lane, if any. */
function FeedsNote(props: { shot: Shot; end: ShotEnd }) {
  const fed = () => fedBy({ id: props.shot.id, end: props.end })
  return (
    <Show when={fed().length > 0}>
      <p class="field-note">
        Feeds {fed().map((f) => (f.shot.end === 'double' ? endName(f.shot, f.end) : f.shot.name)).join(', ')}: the
        ball leaves here and crosses open playfield into it.
        {props.end === 'exit' && props.shot.end !== 'double' ? ' Aim the exit direction at it.' : ''}
      </p>
    </Show>
  )
}

const SHOT_TYPE_OPTIONS: { label: string; value: ShotType }[] = [
  { label: 'Single ended', value: 'single' },
  { label: 'Double ended', value: 'double' },
  { label: 'Ramp', value: 'ramp' },
]

const SHOT_TYPE_NOTES: Record<ShotType, string> = {
  single: 'Shot into at the entrance; the ball leaves by the exit.',
  double: 'Both ends are entrances and exits: a ball shot into either end leaves by the other.',
  ramp: "Rises off the playfield, so it can pass over other lanes; lanes on the playfield can't cross. Shot into at the entrance.",
}

function ShotTypeField(props: { shot: Shot }) {
  return (
    <>
      <SelectField
        label="Shot type"
        options={SHOT_TYPE_OPTIONS}
        value={shotType(props.shot)}
        onChange={(type) => setShotType(props.shot.id, type)}
      />
      <p class="field-note">{SHOT_TYPE_NOTES[shotType(props.shot)]}</p>
    </>
  )
}

const LANE_END_OPTIONS: { label: string; value: LaneEnd }[] = [
  { label: 'Open', value: 'open' },
  { label: 'Horseshoe', value: 'horseshoe' },
]

/** Whether a single-ended lane ends open or in a horseshoe. */
function LaneEndField(props: { shot: Shot }) {
  return (
    <SelectField
      label="Lane exit"
      options={LANE_END_OPTIONS}
      value={props.shot.end}
      onChange={(end) => end !== props.shot.end && setLaneEnd(props.shot.id, end)}
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
        <ShotTypeField shot={props.shot} />
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
        <OriginField shot={props.shot} end="entrance" />
        <FeedsNote shot={props.shot} end="entrance" />
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

        <h4 class="sidebar-heading">Exit{props.shot.end === 'double' ? ' · also an entrance' : ''}</h4>
        <Show when={props.shot.end !== 'double'}>
          <LaneEndField shot={props.shot} />
        </Show>
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
        <Show when={props.shot.end === 'double'}>
          <OriginField shot={props.shot} end="exit" />
        </Show>
        <NumberField
          label="Direction"
          unit="°"
          min={-180}
          max={180}
          step={1}
          value={props.shot.exit.angle}
          onChange={(angle) => setExit(props.shot.id, { angle })}
        />
        <Show when={props.shot.end === 'double'}>
          <p class="field-note">
            Like the entrance, the exit lines up with the ball coming into it; the direction is used only while none
            does.
          </p>
        </Show>
        <NumberField
          label="Width"
          unit="in"
          min={0.25}
          max={10}
          step={0.0625}
          value={props.shot.exitWidth}
          onChange={(exitWidth) => updateShot(props.shot.id, { exitWidth })}
        />
        <Show when={props.shot.end === 'double'}>
          <SliderField
            label="Exit offset"
            min={-laneMaxOffset(props.shot.exitWidth)}
            max={laneMaxOffset(props.shot.exitWidth)}
            centered
            value={fitOffset(props.shot.exitOffset, props.shot.exitWidth)}
            format={formatSigned}
            ends={['ball nearer left wall', 'nearer right wall']}
            onChange={(exitOffset) => updateShot(props.shot.id, { exitOffset })}
          />
          <PivotField
            value={props.shot.exitPivot}
            onChange={(exitPivot) => updateShot(props.shot.id, { exitPivot })}
          />
          <SliderField
            label="Straight lead-in"
            min={0}
            max={8}
            value={props.shot.exitLeadIn}
            format={formatInches}
            onChange={(exitLeadIn) => updateShot(props.shot.id, { exitLeadIn })}
          />
        </Show>
        <Show when={props.shot.end === 'horseshoe'} fallback={<FeedsNote shot={props.shot} end="exit" />}>
          <HorseshoeFields shot={props.shot} />
        </Show>

        <h4 class="sidebar-heading">Lane</h4>
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
