import { Show } from 'solid-js'
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
  mass,
  setFlippers,
  setSpacingMode,
  unloadedStrokeMs,
  type Alignment,
  type SpacingMode,
} from '../state/flippers'
import { inlanes, setInlanes } from '../state/inlanes'
import { ball, setBall } from '../state/ball'
import { walls, setWalls } from '../state/walls'
import { COILS, MATERIALS, type CoilId, type MaterialId } from '../physics/drive'
import { WALL_MATERIALS, type WallMaterialId } from '../physics/wall'

const ALIGNMENT_OPTIONS: { label: string; value: Alignment }[] = [
  { label: 'Top edge', value: 'top' },
  { label: 'Centered', value: 'centered' },
  { label: 'Bottom edge (flopped)', value: 'flopped' },
]

const COIL_OPTIONS: { label: string; value: CoilId }[] = COILS.map((c) => ({ label: c.label, value: c.id }))

const MATERIAL_OPTIONS: { label: string; value: MaterialId }[] = MATERIALS.map((m) => ({ label: m.label, value: m.id }))

const WALL_MATERIAL_OPTIONS: { label: string; value: WallMaterialId }[] = WALL_MATERIALS.map((m) => ({
  label: m.label,
  value: m.id,
}))

const SPACING_OPTIONS: { label: string; value: SpacingMode }[] = [
  { label: 'Distance between pivots', value: 'pivots' },
  { label: 'Distance between tips', value: 'tips' },
]

const inches = (value: number) => `${value.toFixed(2)}"`

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
          <button type="button" class="wall-mount-add" onClick={clearPlayfieldImage}>
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
            if (file) loadPlayfieldImage(file)
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
        <NumberField
          label="Base radius"
          unit="in"
          min={0.05}
          max={5}
          step={0.0025}
          value={flippers.baseRadius}
          highlight="flippers.baseRadius"
          onChange={(baseRadius) => setFlippers('baseRadius', baseRadius)}
        />
        <NumberField
          label="Tip radius"
          unit="in"
          min={0.05}
          max={5}
          step={0.0025}
          value={flippers.tipRadius}
          highlight="flippers.tipRadius"
          onChange={(tipRadius) => setFlippers('tipRadius', tipRadius)}
        />
        <NumberField
          label="Length"
          unit="in"
          min={0.125}
          max={20}
          step={0.01}
          value={flippers.length}
          highlight="flippers.length"
          onChange={(length) => setFlippers('length', length)}
        />
        <NumberField
          label="Rubber thickness"
          unit="in"
          min={0}
          max={1}
          step={0.01}
          value={flippers.rubberThickness}
          highlight="flippers.rubberThickness"
          onChange={(rubberThickness) => setFlippers('rubberThickness', rubberThickness)}
        />
        <SelectField
          label="Material"
          options={MATERIAL_OPTIONS}
          value={flippers.material}
          onChange={(material) => setFlippers('material', material)}
        />
        <p class="field-note">Flipper mass: {(mass() / 28.3495).toFixed(2)} oz</p>
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
