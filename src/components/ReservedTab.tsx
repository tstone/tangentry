import { For, Match, Show, Switch } from 'solid-js'
import NumberField from './NumberField'
import CardName from './CardName'
import { playfield } from '../state/playfield'
import {
  MIN_POLYGON_POINTS,
  addReserved,
  insertPoint,
  movePoint,
  removePoint,
  removeReserved,
  renameReserved,
  reserved,
  selectedReservedId,
  setCircle,
  setSelectedReservedId,
  setShootable,
  type ReservedArea,
  type ReservedCircle,
  type ReservedPolygon,
} from '../state/reserved'
import { formatInches } from './Dimensions'

function CircleFields(props: { area: ReservedCircle }) {
  return (
    <>
      <h4 class="sidebar-heading">Center</h4>
      <div class="field-pair">
        <NumberField
          label="X"
          unit="in"
          min={0}
          max={playfield.width}
          step={0.125}
          value={props.area.center.x}
          onChange={(x) => setCircle(props.area.id, { center: { ...props.area.center, x } })}
        />
        <NumberField
          label="Y"
          unit="in"
          min={0}
          max={playfield.height}
          step={0.125}
          value={props.area.center.y}
          onChange={(y) => setCircle(props.area.id, { center: { ...props.area.center, y } })}
        />
      </div>
      <NumberField
        label="Radius"
        unit="in"
        min={0.25}
        max={20}
        step={0.0625}
        value={props.area.radius}
        onChange={(radius) => setCircle(props.area.id, { radius })}
      />
      <p class="field-note">Drag the middle dot to move it, or the dot on its edge to resize it.</p>
    </>
  )
}

function PolygonFields(props: { area: ReservedPolygon }) {
  const removable = () => props.area.points.length > MIN_POLYGON_POINTS
  return (
    <>
      <h4 class="sidebar-heading">Corners</h4>
      <For each={props.area.points}>
        {(point, i) => (
          <div class="wall-mount">
            <div class="wall-mount-header">
              <span class="via-point-label">Corner {i() + 1}</span>
              <button
                type="button"
                class="icon-button"
                aria-label={`Remove corner ${i() + 1}`}
                title="Remove corner"
                disabled={!removable()}
                onClick={() => removePoint(props.area.id, point.id)}
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
                onChange={(x) => movePoint(props.area.id, point.id, { x })}
              />
              <NumberField
                label="Y"
                unit="in"
                min={0}
                max={playfield.height}
                step={0.125}
                value={point.y}
                onChange={(y) => movePoint(props.area.id, point.id, { y })}
              />
            </div>
          </div>
        )}
      </For>
      <button type="button" class="wall-mount-add" onClick={() => insertPoint(props.area.id)}>
        + Add corner
      </button>
      <p class="field-note">
        New corners go midway along the longest side. Drag the middle dot to move the whole shape, or a corner to
        reshape it; double-click a corner to remove it.
      </p>
    </>
  )
}

const summary = (area: ReservedArea) =>
  area.kind === 'circle' ? `circle, ${formatInches(area.radius)} radius` : `${area.points.length} corners`

function ReservedCard(props: { area: ReservedArea }) {
  const selected = () => selectedReservedId() === props.area.id
  return (
    <section class="sidebar-section shot-card" classList={{ 'is-selected': selected() }}>
      <div class="shot-header">
        <CardName
          name={props.area.name}
          selected={selected()}
          summary={summary(props.area)}
          onSelect={() => setSelectedReservedId(props.area.id)}
          onRename={(name) => renameReserved(props.area.id, name)}
        />
        <button
          type="button"
          class="icon-button"
          aria-label={`Remove ${props.area.name}`}
          title="Remove reserved area"
          onClick={() => removeReserved(props.area.id)}
        >
          −
        </button>
      </div>
      <Show when={selected()}>
        <label class="checkbox-field">
          <input
            type="checkbox"
            checked={props.area.shootable}
            onChange={(e) => setShootable(props.area.id, e.currentTarget.checked)}
          />
          Shootable
        </label>
        <Show when={props.area.shootable}>
          <p class="field-note">Shades the space the ball needs clear to reach it from either flipper.</p>
        </Show>
        <Switch>
          <Match when={props.area.kind === 'circle' && props.area}>{(area) => <CircleFields area={area()} />}</Match>
          <Match when={props.area.kind === 'polygon' && props.area}>{(area) => <PolygonFields area={area()} />}</Match>
        </Switch>
      </Show>
    </section>
  )
}

export default function ReservedTab() {
  return (
    <>
      <div class="shots-toolbar">
        <h2 class="sidebar-heading">Reserved</h2>
        <div class="reserved-add">
          <button type="button" class="wall-mount-add" onClick={() => addReserved('circle')}>
            + Circle
          </button>
          <button type="button" class="wall-mount-add" onClick={() => addReserved('polygon')}>
            + Polygon
          </button>
        </div>
      </div>
      <p class="reserved-intro field-note">
        Mark space on the playfield held for mechs, toys, scoops and other features, so lanes can be laid out around
        them. Reserved areas are only markers; they don't affect the ball.
      </p>

      <Show when={reserved.length > 0} fallback={<p class="sidebar-empty">Nothing reserved yet.</p>}>
        <For each={reserved}>{(area) => <ReservedCard area={area} />}</For>
      </Show>
    </>
  )
}
