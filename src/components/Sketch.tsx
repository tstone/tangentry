import { For, Index, Show } from 'solid-js'
import {
  SKETCH_COLORS,
  activeColor,
  cancelSketch,
  chooseColor,
  finishSketch,
  fitting,
  strokes,
  undoStroke,
} from '../state/sketch'

/**
 * The colors to sketch lanes in, one for each shot, and the button that
 * fits lanes to what's drawn. Overlaid top center of the preview.
 */
export default function SketchPalette() {
  const busy = () => fitting() !== null
  return (
    <div class="sketch-bar">
      <div class="sketch-palette" role="radiogroup" aria-label="Sketch color">
        <Index each={SKETCH_COLORS}>
          {(color, i) => (
            <button
              type="button"
              role="radio"
              class="sketch-swatch"
              classList={{ 'is-active': activeColor() === i, 'has-strokes': strokes[i].length > 0 }}
              style={{ background: color() }}
              aria-checked={activeColor() === i}
              aria-label={`Shot color ${i + 1}`}
              title={activeColor() === i ? 'Drawing in this color; click again to pan instead' : 'Draw a shot in this color'}
              disabled={busy()}
              onClick={() => chooseColor(i)}
            />
          )}
        </Index>
      </div>
      <button
        type="button"
        class="sketch-button"
        title="Take back the last stroke in this color"
        disabled={busy() || activeColor() === null || strokes[activeColor()!].length === 0}
        onClick={() => undoStroke(activeColor()!)}
      >
        Undo
      </button>
      <button type="button" class="sketch-button" disabled={busy()} onClick={cancelSketch}>
        Cancel
      </button>
      <button
        type="button"
        class="sketch-button sketch-finish"
        title="Fit a smooth lane to each color's strokes"
        disabled={busy()}
        aria-busy={busy()}
        onClick={finishSketch}
      >
        <Show when={busy()} fallback="Finish">
          <span class="spinner" aria-hidden="true" />
          Fitting…
        </Show>
      </button>
      <Show when={fitting()}>
        {(p) => (
          <div
            class="smoothen-progress sketch-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={p().most}
            aria-valuenow={p().tried}
          >
            <div class="smoothen-progress-bar" style={{ width: `${(100 * p().tried) / p().most}%` }} />
          </div>
        )}
      </Show>
    </div>
  )
}

/** Strokes drawn so far, in their colors. Must be rendered inside the preview SVG. */
export function SketchStrokes() {
  return (
    <g class="sketch-strokes">
      <Index each={SKETCH_COLORS}>
        {(color, i) => (
          <For each={strokes[i]}>
            {(stroke) => (
              <polyline
                class="sketch-stroke"
                stroke={color()}
                points={stroke.map((p) => `${p.x},${p.y}`).join(' ')}
                vector-effect="non-scaling-stroke"
              />
            )}
          </For>
        )}
      </Index>
    </g>
  )
}
