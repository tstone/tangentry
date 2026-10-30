import { Match, Show, Switch } from 'solid-js'
import { addShot, selectedShot, shots } from '../state/shots'
import { addReserved, reserved, selectedReservedId } from '../state/reserved'
import { extraFlippers, selectedFlipperId } from '../state/extraFlippers'
import { insertVia } from '../state/viaPoints'
import { sketching, startSketch } from '../state/sketch'
import { runSmoothen, smoothing } from '../state/smoothenRun'
import { busy, removeFocused } from '../state/removeFocused'
import { log } from '../state/log'
import ResetDialog from './ResetDialog'

/**
 * Tools down the left of the preview, under the zoom. The middle group acts on
 * the item in focus and changes with it: a shot, custom mech or extra flipper.
 */
export default function Toolbar() {
  // While busy, the focused item's tools stay showing but disabled.
  const shot = selectedShot
  const mech = () => reserved.find((a) => a.id === selectedReservedId())
  const flipper = () => extraFlippers.find((f) => f.id === selectedFlipperId())

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
    if (!s || busy()) return
    insertVia(s.id)
    log(`Added a bend point to ${s.name}.`)
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

      <Switch>
        <Match when={shot()}>
          {(s) => (
            <>
              <div class="tool-strip-divider" role="separator" />
              <button
                type="button"
                class="preview-zoom-button toolbar-icon-button"
                title={`Add a bend point to ${s().name}, midway along the longest stretch of its lane`}
                disabled={busy()}
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
                    : `Smoothen ${s().name}: adjust entrance offset, lead-in, weights, funnel and bend points so the ball gets through more cleanly`
                }
                disabled={busy()}
                onClick={() => runSmoothen(s().id)}
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
                title={`Remove ${s().name} (Delete)`}
                disabled={busy()}
                onClick={removeFocused}
              >
                {/* A lane with a minus. */}
                <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M2.5 13.5C2.5 8 6 4 11.5 3" />
                  <path d="M9 11h5" />
                </svg>
                Remove shot
              </button>
            </>
          )}
        </Match>
        <Match when={mech()}>
          {(m) => (
            <>
              <div class="tool-strip-divider" role="separator" />
              <button
                type="button"
                class="preview-zoom-button toolbar-icon-button"
                title={`Remove ${m().name} (Delete)`}
                disabled={busy()}
                onClick={removeFocused}
              >
                {/* A dashed circle with a minus. */}
                <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
                  <circle cx="8" cy="8" r="5.5" stroke-dasharray="3 2" />
                  <path d="M5.5 8h5" />
                </svg>
                Remove mech
              </button>
            </>
          )}
        </Match>
        <Match when={flipper()}>
          {(f) => (
            <>
              <div class="tool-strip-divider" role="separator" />
              <button
                type="button"
                class="preview-zoom-button toolbar-icon-button"
                title={`Remove ${f().name} (Delete)`}
                disabled={busy()}
                onClick={removeFocused}
              >
                {/* A flipper with a minus. */}
                <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M2 5.5a2 2 0 0 1 2.4-2l8 2.2a1 1 0 0 1 0 1.9l-8 2.2A2 2 0 0 1 2 7.8Z" />
                  <path d="M9 12.5h5" />
                </svg>
                Remove flipper
              </button>
            </>
          )}
        </Match>
      </Switch>

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
