import { Show } from 'solid-js'
import { addShot, removeShot, selectedShot, shots } from '../state/shots'
import { addReserved, reserved } from '../state/reserved'
import { insertVia } from '../state/viaPoints'
import { sketching, startSketch } from '../state/sketch'
import { runSmoothen, smoothing } from '../state/smoothenRun'
import { log } from '../state/log'
import ResetDialog from './ResetDialog'

/** Tools down the left of the preview, under the zoom. Bend point, Smoothen and Remove act on the selected shot. */
export default function Toolbar() {
  const busy = () => sketching() || smoothing() !== null
  const shot = () => (busy() ? undefined : selectedShot())

  const add = () => {
    const id = addShot()
    log(`Added ${shots.find((s) => s.id === id)?.name ?? 'a shot'}.`)
  }
  const addArea = () => {
    addReserved('circle')
    log(`Added ${reserved.at(-1)?.name ?? 'a custom mech'}, a circle.`)
  }
  const addBend = () => {
    const s = shot()
    if (!s) return
    insertVia(s.id)
    log(`Added a bend point to ${s.name}.`)
  }
  const remove = () => {
    const s = shot()
    if (!s) return
    log(`Removed ${s.name}.`)
    removeShot(s.id)
  }

  return (
    <div class="tool-strip" role="toolbar" aria-orientation="vertical" aria-label="Tools">
      <button
        type="button"
        class="preview-zoom-button toolbar-icon-button"
        title="Add a circular custom mech, marking space for a mech, toy or other feature. Polygons can be added from the Mechs tab."
        disabled={busy()}
        onClick={addArea}
      >
        {/* A dashed circle. */}
        <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="5.5" stroke-dasharray="3 2" />
        </svg>
        Add custom mech
      </button>
      <button
        type="button"
        class="preview-zoom-button toolbar-icon-button"
        title="Add shot"
        disabled={busy()}
        onClick={add}
      >
        {/* A lane with a plus. */}
        <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 13.5C2.5 8 6 4 11.5 3" />
          <path d="M11.5 8.5v5M9 11h5" />
        </svg>
        Add shot
      </button>
      <button
        type="button"
        class="preview-zoom-button toolbar-icon-button"
        classList={{ 'is-active': sketching() }}
        aria-pressed={sketching()}
        title="Sketch shots: draw lanes over the playfield, then fit shots to them"
        disabled={busy()}
        onClick={startSketch}
      >
        {/* A pencil. */}
        <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M11 2.5 13.5 5 6 12.5 2.5 13.5 3.5 10Z" />
          <path d="M9.5 4 12 6.5" />
        </svg>
        Sketch shot
      </button>

      <div class="tool-strip-divider" role="separator" />

      <button
        type="button"
        class="preview-zoom-button toolbar-icon-button"
        title={
          shot()
            ? `Add a bend point to ${shot()!.name}, midway along the longest stretch of its lane`
            : 'Add bend point: select a shot first'
        }
        disabled={!shot()}
        onClick={addBend}
      >
        {/* A curve bending through a point. */}
        <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M1.5 13.5C4.5 13.5 5.5 8 8 8s3.5-5.5 6.5-5.5" />
          <circle class="toolbar-icon-node" cx="8" cy="8" r="1.75" />
        </svg>
        Add bend point
      </button>
      <button
        type="button"
        class="preview-zoom-button toolbar-icon-button"
        aria-busy={smoothing() !== null}
        title={
          smoothing()
            ? `Smoothing… tried ${smoothing()!.tried} lane shapes so far`
            : shot()
              ? `Smoothen ${shot()!.name}: adjust entrance offset, lead-in, weights, funnel and bend points so the ball gets through more cleanly`
              : 'Smoothen: select a shot first'
        }
        disabled={!shot()}
        onClick={() => shot() && runSmoothen(shot()!.id)}
      >
        <Show
          when={smoothing()}
          fallback={
            // A wand with sparkles.
            <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2.5 13.5 10 6M8.75 4.75l2.5 2.5" />
              <path d="M12.5 1.5v3M11 3h3M14 8v2.5M12.75 9.25h2.5M5.5 2v2M4.5 3h2" />
            </svg>
          }
        >
          <span class="spinner" aria-hidden="true" />
        </Show>
        {smoothing() ? 'Smoothing…' : 'Smoothen'}
      </button>
      <button
        type="button"
        class="preview-zoom-button toolbar-icon-button"
        title={shot() ? `Remove ${shot()!.name}` : 'Remove shot: select a shot first'}
        disabled={!shot()}
        onClick={remove}
      >
        {/* A lane with a minus. */}
        <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 13.5C2.5 8 6 4 11.5 3" />
          <path d="M9 11h5" />
        </svg>
        Remove shot
      </button>

      <div class="tool-strip-divider" role="separator" />

      <ResetDialog disabled={busy()} />
    </div>
  )
}

/** Progress of a Smoothen run, along the bottom of the preview while it runs. */
export function SmoothenStatus() {
  const name = (id: number) => shots.find((s) => s.id === id)?.name ?? 'shot'
  return (
    <Show when={smoothing()}>
      {(p) => (
        <div class="smoothen-status" role="status">
          <div class="smoothen-status-line">
            <span class="spinner" aria-hidden="true" />
            <span>Smoothing {name(p().shotId)}…</span>
            <span class="smoothen-status-note">
              Tried {p().tried} lane shapes so far. Stops early once every ball path runs smooth.
            </span>
          </div>
          <div class="smoothen-progress" role="progressbar" aria-valuemin={0} aria-valuemax={p().most} aria-valuenow={p().tried}>
            <div class="smoothen-progress-bar" style={{ width: `${(100 * p().tried) / p().most}%` }} />
          </div>
        </div>
      )}
    </Show>
  )
}
