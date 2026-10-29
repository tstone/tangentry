import NumberField from './NumberField'
import SelectField from './SelectField'
import { playfield, setPlayfield } from '../state/playfield'
import {
  flippers,
  setFlippers,
  setSpacingMode,
  type Alignment,
  type SpacingMode,
} from '../state/flippers'
import { inlanes, setInlanes } from '../state/inlanes'

const ALIGNMENT_OPTIONS: { label: string; value: Alignment }[] = [
  { label: 'Top edge', value: 'top' },
  { label: 'Centered', value: 'centered' },
  { label: 'Bottom edge (flopped)', value: 'flopped' },
]

const SPACING_OPTIONS: { label: string; value: SpacingMode }[] = [
  { label: 'Distance between pivots', value: 'pivots' },
  { label: 'Distance between tips', value: 'tips' },
]

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
      </section>

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
          step={0.0625}
          value={flippers.baseRadius}
          highlight="flippers.baseRadius"
          onChange={(baseRadius) => setFlippers('baseRadius', baseRadius)}
        />
        <NumberField
          label="Tip radius"
          unit="in"
          min={0.05}
          max={5}
          step={0.0625}
          value={flippers.tipRadius}
          highlight="flippers.tipRadius"
          onChange={(tipRadius) => setFlippers('tipRadius', tipRadius)}
        />
        <NumberField
          label="Length"
          unit="in"
          min={0.125}
          max={20}
          step={0.125}
          value={flippers.length}
          highlight="flippers.length"
          onChange={(length) => setFlippers('length', length)}
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
    </>
  )
}
