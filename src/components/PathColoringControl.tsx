import { For, Match, Show, Switch } from 'solid-js'
import SelectField from './SelectField'
import { BALL_STATES } from '../state/solutions'
import { PATH_COLORINGS, SPEED_STOPS, pathColoring, setPathColoring, speedRange } from '../state/view'

const OUTCOMES = [
  { outcome: 'smooth', label: 'Smooth' },
  { outcome: 'chatter', label: 'Chatter' },
  { outcome: 'ricochet', label: 'Ricochet' },
  { outcome: 'rattle', label: 'Rattle' },
  { outcome: 'stalls', label: 'Stalls' },
]

function Swatch(props: { class: string; label: string }) {
  return (
    <li class={`path-legend-item ${props.class}`}>
      <span class="path-legend-swatch" />
      {props.label}
    </li>
  )
}

/** Chooses what the shot paths are colored by, with a key. Overlaid on the preview. */
export default function PathColoringControl() {
  return (
    <div class="path-coloring">
      <SelectField label="Color paths by" options={PATH_COLORINGS} value={pathColoring()} onChange={setPathColoring} />
      <Switch>
        <Match when={pathColoring() === 'origin'}>
          <ul class="path-legend">
            <For each={BALL_STATES}>{({ state, label }) => <Swatch class={`origin--${state}`} label={label} />}</For>
          </ul>
        </Match>
        <Match when={pathColoring() === 'smoothness'}>
          <ul class="path-legend">
            <For each={OUTCOMES}>{({ outcome, label }) => <Swatch class={`outcome--${outcome}`} label={label} />}</For>
          </ul>
        </Match>
        <Match when={pathColoring() === 'speed'}>
          <Show when={speedRange()}>
            {(range) => (
              <div class="path-legend-speed">
                <span class="path-legend-gradient" style={{ background: `linear-gradient(to right, ${SPEED_STOPS.join(', ')})` }} />
                <div class="path-legend-range">
                  <span>{Math.round(range().min)} in/s</span>
                  <span>{Math.round(range().max)} in/s</span>
                </div>
              </div>
            )}
          </Show>
        </Match>
      </Switch>
    </div>
  )
}
