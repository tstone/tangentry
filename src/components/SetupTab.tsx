import { For, Show } from 'solid-js'
import CardName from './CardName'
import NumberField from './NumberField'
import SelectField from './SelectField'
import SliderField from './SliderField'
import { playfield, setPlayfield } from '../state/playfield'
import {
  clearPlayfieldImage,
  fitPlayfieldImage,
  imageHeight,
  loadPlayfieldImage,
  playfieldImage,
  setPlayfieldImage,
} from '../state/playfieldImage'
import {
  flippers,
  profile,
  setFlippers,
  setSpacingMode,
  unloadedStrokeMs,
  type Alignment,
  type SpacingMode,
} from '../state/flippers'
import {
  addExtraFlipper,
  extraFlippers,
  FEED_OFFSET_MAX,
  flipperFeed,
  removeExtraFlipper,
  selectedFlipperId,
  setSelectedFlipperId,
  updateExtraFlipper,
  type ExtraFlipper,
} from '../state/extraFlippers'
import { canFeedFlipper, endName, rollsBackFrom, shots, type Feed, type ShotEnd } from '../state/shots'
import { fedFlipperSettings, fedPivotAt, feedDistance, resolvedExtraFlipper } from '../state/solutions'
import { formatDegrees } from './Dimensions'
import { hoveredFlipper, setCalledOutFeed } from '../state/view'
import { flipperHoverHandlers } from './ExtraFlippers'
import { inlanes, setInlanes } from '../state/inlanes'
import { ball, setBall } from '../state/ball'
import { walls, setWalls } from '../state/walls'
import { log } from '../state/log'
import { COILS, FLIPPER_PROFILES, type CoilId, type FlipperProfileId } from '../physics/drive'
import type { HighlightKey } from '../state/highlight'
import { highlightHandlers } from './highlightHandlers'
import { WALL_MATERIALS, type WallMaterialId } from '../physics/wall'

const ALIGNMENT_OPTIONS: { label: string; value: Alignment }[] = [
  { label: 'Top edge', value: 'top' },
  { label: 'Centered', value: 'centered' },
  { label: 'Bottom edge (flopped)', value: 'flopped' },
]

const COIL_OPTIONS: { label: string; value: CoilId }[] = COILS.map((c) => ({ label: c.label, value: c.id }))

const PROFILE_OPTIONS: { label: string; value: FlipperProfileId }[] = FLIPPER_PROFILES.map((p) => ({
  label: p.label,
  value: p.id,
}))

const WALL_MATERIAL_OPTIONS: { label: string; value: WallMaterialId }[] = WALL_MATERIALS.map((m) => ({
  label: m.label,
  value: m.id,
}))

const SPACING_OPTIONS: { label: string; value: SpacingMode }[] = [
  { label: 'Distance between pivots', value: 'pivots' },
  { label: 'Distance between tips', value: 'tips' },
]

const inches = (value: number) => `${value.toFixed(2)}"`

/** A fixed value from the flipper profile, called out on the preview while hovered. */
function Spec(props: { label: string; value: string; highlight?: HighlightKey }) {
  return (
    <div class="spec-row" {...highlightHandlers(props.highlight)}>
      <dt>{props.label}</dt>
      <dd>{props.value}</dd>
    </div>
  )
}

// Nudge for lining the playfield image up, inches.
const IMAGE_STEP = 0.01

/** A picture under the preview to lay shots out against, faded and moved into register. */
function PlayfieldImageSection() {
  let input!: HTMLInputElement
  return (
    <section class="sidebar-section">
      <h2 class="sidebar-heading">Playfield Image</h2>
      <div class="playfield-image-file">
        <span class="playfield-image-name">{playfieldImage.name || 'None'}</span>
        <button type="button" class="wall-mount-add" onClick={() => input.click()}>
          {playfieldImage.src ? 'Replace' : 'Upload'}
        </button>
        <Show when={playfieldImage.src}>
          <button type="button" class="wall-mount-add" onClick={() => {
            clearPlayfieldImage()
            log('Removed the playfield image.')
          }}>
            Remove
          </button>
        </Show>
        <input
          ref={input}
          class="playfield-image-input"
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            if (file) {
              loadPlayfieldImage(file)
              log(`Loaded playfield image ${file.name}.`)
            }
            // Let the same file be picked again after it's removed.
            event.currentTarget.value = ''
          }}
        />
      </div>
      <Show when={playfieldImage.src}>
        <SliderField
          label="Opacity"
          value={playfieldImage.opacity}
          min={0}
          max={1}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(opacity) => setPlayfieldImage('opacity', opacity)}
        />
        <NumberField
          label="Width"
          unit="in"
          min={1}
          max={playfield.width * 4}
          step={IMAGE_STEP}
          value={playfieldImage.width}
          onChange={(width) => setPlayfieldImage('width', width)}
        />
        <p class="field-note">Height {inches(imageHeight())}, from the image's proportions.</p>
        <NumberField
          label="Left edge"
          unit="in"
          min={-playfield.width}
          max={playfield.width}
          step={IMAGE_STEP}
          value={playfieldImage.x}
          onChange={(x) => setPlayfieldImage('x', x)}
        />
        <NumberField
          label="Bottom edge"
          unit="in"
          min={-playfield.height}
          max={playfield.height}
          step={IMAGE_STEP}
          value={playfieldImage.y}
          onChange={(y) => setPlayfieldImage('y', y)}
        />
        <button type="button" class="wall-mount-add" onClick={fitPlayfieldImage}>
          Fit to playfield
        </button>
        <p class="field-note">
          Edges are measured from the playfield's left edge and bottom lip. The arrows and arrow keys step 0.01".
        </p>
      </Show>
    </section>
  )
}

const SIDE_OPTIONS: { label: string; value: ExtraFlipper['side'] }[] = [
  { label: 'Left (points right)', value: 'left' },
  { label: 'Right (points left)', value: 'right' },
]

// The lane end feeding an extra flipper, as `${id}-${end}`, or none.
type FeedChoice = 'none' | `${number}-${ShotEnd}`

const feedOf = (choice: `${number}-${ShotEnd}`): Feed => {
  const [id, end] = choice.split('-')
  return { id: Number(id), end: end as ShotEnd }
}

/**
 * Where the ball comes onto an extra flipper from: rolling in at its own
 * entrance speed, or out of a lane's end, which it then lines up with.
 */
function FlipperFeedField(props: { flipper: ExtraFlipper }) {
  const f = () => props.flipper
  const feed = () => flipperFeed(f())
  const fed = () => (feed() ? fedFlipperSettings(f()) : null)
  const options = (): { label: string; value: FeedChoice }[] => [
    { label: 'Rolls in at its entrance speed', value: 'none' },
    // Any lane's exit, and either end of a double-ended lane, or a
    // single-ended lane's entrance, the ball rolling back out of it.
    ...shots.flatMap((s) =>
      (['exit', 'entrance'] as const)
        .filter((end) => canFeedFlipper(s, end))
        .map((end) => ({
          label: rollsBackFrom(s, end) ? `${endName(s, end)}, rolling back from its end` : endName(s, end),
          value: `${s.id}-${end}` as FeedChoice,
        })),
    ),
  ]
  const rollsBack = () => {
    const from = feed()
    const shot = from && shots.find((s) => s.id === from.id)
    return !!from && !!shot && rollsBackFrom(shot, from.end)
  }
  const value = (): FeedChoice => {
    const from = feed()
    return from ? `${from.id}-${from.end}` : 'none'
  }
  const source = () => {
    const from = feed()
    const shot = from && shots.find((s) => s.id === from.id)
    return from && shot ? endName(shot, from.end) : ''
  }
  return (
    <>
      <SelectField
        label="Fed from"
        options={options()}
        value={value()}
        onHover={(choice) => setCalledOutFeed(choice === null || choice === 'none' ? null : feedOf(choice))}
        onChange={(choice) => {
          if (choice === value()) return
          if (choice === 'none') {
            // Keep the flipper where the lane had it, rather than jumping back.
            const settings = fed()
            const { x, y } = resolvedExtraFlipper(f()).pivot
            updateExtraFlipper(f().id, {
              feed: null,
              pivot: { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 },
              ...(settings && {
                side: settings.side,
                restAngle: Math.round(settings.restAngle * 10) / 10,
                ...(settings.entranceSpeed !== null && { entranceSpeed: Math.round(settings.entranceSpeed) }),
              }),
            })
            return
          }
          updateExtraFlipper(f().id, { feed: feedOf(choice) })
        }}
      />
      <Show when={fed()}>
        {(settings) => (
          <p class="field-note">
            Points the way the ball leaves {source()}: mounted {settings().side}, at{' '}
            {formatDegrees(settings().restAngle)} below horizontal.{' '}
            {rollsBack()
              ? settings().entranceSpeed === null
                ? "The ball doesn't make it back out rolling from rest at the lane's far end, so it lines up with the entrance and arrives at the entrance speed below."
                : `The ball rolls back down the lane from rest at its far end, as off a target, captive ball or magnet there, arriving at ${Math.round(settings().entranceSpeed!)} in/s.`
              : settings().entranceSpeed === null
                ? 'No ball path makes it out of there, so the ball arrives at the entrance speed below.'
                : `The ball arrives at the ${Math.round(settings().entranceSpeed!)} in/s it leaves at, along the shot that end's lane is lined up with.`}
          </p>
        )}
      </Show>
    </>
  )
}

function ExtraFlipperCard(props: { flipper: ExtraFlipper }) {
  const f = () => props.flipper
  const update = (changes: Partial<Omit<ExtraFlipper, 'id'>>) => updateExtraFlipper(f().id, changes)
  const selected = () => selectedFlipperId() === f().id
  const fed = () => (flipperFeed(f()) ? fedFlipperSettings(f()) : null)
  return (
    <div
      class="wall-mount extra-flipper-card"
      classList={{ 'is-hovered': hoveredFlipper() === f().id, 'is-selected': selected() }}
      {...flipperHoverHandlers(f().id)}
    >
      <div class="wall-mount-header">
        <CardName
          name={f().name}
          selected={selected()}
          onSelect={() => setSelectedFlipperId(f().id)}
          onRename={(name) => update({ name })}
        />
        <button
          type="button"
          class="icon-button"
          aria-label={`Remove ${f().name}`}
          title="Remove flipper"
          onClick={() => {
            log(`Removed ${f().name}.`)
            removeExtraFlipper(f().id)
          }}
        >
          −
        </button>
      </div>
      <FlipperFeedField flipper={f()} />
      <Show when={!fed()}>
        <SelectField label="Mounted" options={SIDE_OPTIONS} value={f().side} onChange={(side) => update({ side })} />
      </Show>
      <SelectField
        label="Profile"
        options={PROFILE_OPTIONS}
        value={f().profile}
        onChange={(profile) => update({ profile })}
      />
      <SelectField label="Coil" options={COIL_OPTIONS} value={f().coil} onChange={(coil) => update({ coil })} />
      <Show when={!fed()}>
        <NumberField
          label="Rest angle"
          unit="°"
          min={-60}
          max={90}
          step={1}
          value={f().restAngle}
          onChange={(restAngle) => update({ restAngle })}
        />
      </Show>
      {/* A fed flipper keeps its own speed while no ball path makes it out of the lane. */}
      <Show when={fed()?.entranceSpeed == null}>
        <NumberField
          label="Entrance speed"
          unit="in/s"
          min={0}
          max={500}
          step={1}
          value={f().entranceSpeed}
          onChange={(entranceSpeed) => update({ entranceSpeed })}
        />
      </Show>
      {/* A fed flipper stays lined up with the lane feeding it, and only slides along it. */}
      <Show
        when={feedDistance(f()) !== null}
        fallback={
          <div class="field-pair">
            <NumberField
              label="Pivot X"
              unit="in"
              min={0}
              max={playfield.width}
              step={0.125}
              value={f().pivot.x}
              onChange={(x) => update({ pivot: { ...f().pivot, x } })}
            />
            <NumberField
              label="Pivot Y"
              unit="in"
              min={0}
              max={playfield.height}
              step={0.125}
              value={f().pivot.y}
              onChange={(y) => update({ pivot: { ...f().pivot, y } })}
            />
          </div>
        }
      >
        <div class="field-pair">
          <NumberField
            label="Past lane end"
            unit="in"
            min={-12}
            max={48}
            step={0.125}
            value={Math.round(feedDistance(f())! * 1000) / 1000}
            onChange={(distance) => {
              const pivot = fedPivotAt(f(), distance)
              if (pivot) update({ pivot })
            }}
          />
          <NumberField
            label="Offset"
            unit="in"
            min={-FEED_OFFSET_MAX}
            max={FEED_OFFSET_MAX}
            step={1 / 64}
            value={f().feedOffset}
            onChange={(offset) =>
              update({ feedOffset: Math.max(-FEED_OFFSET_MAX, Math.min(FEED_OFFSET_MAX, offset)) })
            }
          />
        </div>
        <p class="field-note">
          Offset moves the flipper off the ball's line, to the right of the way the ball comes in, by up to{' '}
          {FEED_OFFSET_MAX}".
        </p>
      </Show>
    </div>
  )
}

/** Flippers beyond the main pair, each placed anywhere on the playfield. */
function ExtraFlippersSection() {
  return (
    <section class="sidebar-section">
      <h2 class="sidebar-heading">Extra Flippers</h2>
      <For each={extraFlippers}>{(f) => <ExtraFlipperCard flipper={f} />}</For>
      <button
        type="button"
        class="wall-mount-add"
        onClick={() => {
          addExtraFlipper()
          log(`Added ${extraFlippers.at(-1)?.name ?? 'a flipper'}.`)
        }}
      >
        + Add flipper
      </button>
      <p class="field-note">
        Drag a flipper's pivot on the playfield to move it. Rest angle is the center line's, below horizontal. The ball
        rolls onto the flipper down its axis, reaching the base at the entrance speed. A flipper fed from a lane's end
        instead points the way the ball leaves it and takes the speed it leaves at, reckoned from shots off the main
        flippers and extra flippers not fed from a lane. Extra flippers share the stroke and rubber friction above.
      </p>
    </section>
  )
}

export default function SetupTab() {
  return (
    <>
      <section class="sidebar-section">
        <h2 class="sidebar-heading">Playfield</h2>
        <NumberField
          label="Width"
          unit="in"
          min={1}
          max={100}
          step={0.25}
          value={playfield.width}
          highlight="playfield.width"
          onChange={(width) => setPlayfield('width', width)}
        />
        <NumberField
          label="Height"
          unit="in"
          min={1}
          max={100}
          step={0.25}
          value={playfield.height}
          highlight="playfield.height"
          onChange={(height) => setPlayfield('height', height)}
        />
        <NumberField
          label="Angle"
          unit="°"
          min={0}
          max={15}
          step={0.1}
          value={playfield.angle}
          highlight="playfield.angle"
          onChange={(angle) => setPlayfield('angle', angle)}
        />
        <NumberField
          label="Side rails"
          unit="in"
          min={0}
          max={3}
          step={0.0625}
          value={playfield.sideRail}
          highlight="playfield.sideRail"
          onChange={(sideRail) => setPlayfield('sideRail', sideRail)}
        />
      </section>

      <PlayfieldImageSection />

      <section class="sidebar-section">
        <h2 class="sidebar-heading">Flipper Position</h2>
        <NumberField
          label="Center line"
          unit="in"
          min={0}
          max={playfield.width}
          step={0.125}
          value={flippers.centerLine}
          highlight="flippers.centerLine"
          onChange={(centerLine) => setFlippers('centerLine', centerLine)}
        />
        <NumberField
          label="Pivot from bottom"
          unit="in"
          min={0}
          max={playfield.height}
          step={0.125}
          value={flippers.pivotFromBottom}
          highlight="flippers.pivotFromBottom"
          onChange={(pivotFromBottom) => setFlippers('pivotFromBottom', pivotFromBottom)}
        />
        <SelectField
          label="Alignment to inlanes"
          options={ALIGNMENT_OPTIONS}
          value={flippers.alignment}
          highlight="flippers.alignment"
          onChange={(alignment) => setFlippers('alignment', alignment)}
        />
        <SelectField
          label="Spacing"
          options={SPACING_OPTIONS}
          value={flippers.spacingMode}
          highlight="flippers.spacing"
          onChange={setSpacingMode}
        />
        <NumberField
          label={flippers.spacingMode === 'pivots' ? 'Pivot to pivot' : 'Tip gap'}
          unit="in"
          min={0}
          max={playfield.width}
          step={0.125}
          value={flippers.spacing}
          highlight="flippers.spacing"
          onChange={(spacing) => setFlippers('spacing', spacing)}
        />
      </section>

      <section class="sidebar-section">
        <h2 class="sidebar-heading">Flipper Type</h2>
        <SelectField
          label="Profile"
          options={PROFILE_OPTIONS}
          value={flippers.profile}
          onChange={(id) => setFlippers('profile', id)}
        />
        <dl class="spec-list">
          <Spec label="Base radius" value={inches(profile().baseRadius)} highlight="flippers.baseRadius" />
          <Spec label="Tip radius" value={inches(profile().tipRadius)} highlight="flippers.tipRadius" />
          <Spec label="Length" value={inches(profile().length)} highlight="flippers.length" />
          <Spec label="Rubber thickness" value={inches(profile().rubberThickness)} highlight="flippers.rubberThickness" />
          <Spec label="Mass" value={`${(profile().mass / 28.3495).toFixed(2)} oz`} />
        </dl>
        <NumberField
          label="Rubber friction"
          unit="μ"
          min={0}
          max={1.5}
          step={0.05}
          value={flippers.friction}
          onChange={(friction) => setFlippers('friction', friction)}
        />
      </section>

      <section class="sidebar-section">
        <h2 class="sidebar-heading">Flipper Motion</h2>
        <NumberField
          label="Stroke angle"
          unit="°"
          min={1}
          max={120}
          step={1}
          value={flippers.strokeAngle}
          highlight="flippers.strokeAngle"
          onChange={(strokeAngle) => setFlippers('strokeAngle', strokeAngle)}
        />
        <SelectField
          label="Coil"
          options={COIL_OPTIONS}
          value={flippers.coil}
          onChange={(coil) => setFlippers('coil', coil)}
        />
        <p class="field-note">Unloaded stroke: {Math.round(unloadedStrokeMs())} ms</p>
      </section>

      <ExtraFlippersSection />

      <section class="sidebar-section">
        <h2 class="sidebar-heading">Ball</h2>
        <NumberField
          label="Diameter"
          unit="in"
          min={0.25}
          max={3}
          step={0.0625}
          value={ball.diameter}
          onChange={(diameter) => setBall('diameter', diameter)}
        />
        <NumberField
          label="Inlane entry speed"
          unit="in/s"
          min={0}
          max={500}
          step={1}
          value={ball.inlaneSpeed}
          onChange={(inlaneSpeed) => setBall('inlaneSpeed', inlaneSpeed)}
        />
      </section>

      <section class="sidebar-section">
        <h2 class="sidebar-heading">Inlanes</h2>
        <NumberField
          label="Angle"
          unit="°"
          min={0}
          max={90}
          step={1}
          value={inlanes.angle}
          highlight="inlanes.angle"
          onChange={(angle) => setInlanes('angle', angle)}
        />
      </section>

      <section class="sidebar-section">
        <h2 class="sidebar-heading">Lane Walls</h2>
        <SelectField
          label="Material"
          options={WALL_MATERIAL_OPTIONS}
          value={walls.material}
          onChange={(material) => setWalls('material', material)}
        />
        <NumberField
          label="Thickness"
          unit="in"
          min={0.01}
          max={0.25}
          step={0.005}
          value={walls.thickness}
          onChange={(thickness) => setWalls('thickness', thickness)}
        />
        <NumberField
          label="Height"
          unit="in"
          min={0.25}
          max={4}
          step={0.0625}
          value={walls.height}
          onChange={(height) => setWalls('height', height)}
        />
        <NumberField
          label="Bounciness where rigid"
          unit="e"
          min={0}
          max={1}
          step={0.05}
          value={walls.restitution}
          onChange={(restitution) => setWalls('restitution', restitution)}
        />
        <p class="field-note">Right at a spade bolt. Between mounts the wall flexes and returns less.</p>
        <NumberField
          label="Spade bolt stiffness"
          unit="lbf/in"
          min={100}
          max={100000}
          step={500}
          value={walls.spadeStiffness}
          onChange={(spadeStiffness) => setWalls('spadeStiffness', spadeStiffness)}
        />
        <NumberField
          label="Spike stiffness"
          unit="lbf/in"
          min={100}
          max={100000}
          step={250}
          value={walls.spikeStiffness}
          onChange={(spikeStiffness) => setWalls('spikeStiffness', spikeStiffness)}
        />
        <p class="field-note">How hard each mount resists the wall being pushed sideways. Estimates; tune to match real walls.</p>
      </section>
    </>
  )
}
