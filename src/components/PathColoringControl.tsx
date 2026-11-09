import { For, Match, Show, Switch } from 'solid-js'
import SelectField from './SelectField'
import { DIFFICULTY_BANDS } from '../state/difficulty'
import { PATH_COLORINGS, SPEED_STOPS, pathColoring, setPathColoring, speedRange } from '../state/view'

const OUTCOMES = [
  { outcome: 'smooth', label: 'Smooth' },
  { outcome: 'chatter', label: 'Chatter' },
  { outcome: 'ricochet', label: 'Ricochet' },
  { outcome: 'rattle', label: 'Rattle' },
  { outcome: 'stalls', label: 'Stalls' },
  { outcome: 'misses', label: 'Misses' },
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
      <SelectField label="Paths" options={PATH_COLORINGS} value={pathColoring()} onChange={setPathColoring} />
      <Switch>
        <Match when={pathColoring() === 'smoothness'}>
          <ul class="path-legend">
            <For each={OUTCOMES}>{({ outcome, label }) => <Swatch class={`outcome--${outcome}`} label={label} />}</For>
          </ul>
        </Match>
        <Match when={pathColoring() === 'difficulty'}>
          <ul class="path-legend">
            <For each={DIFFICULTY_BANDS}>
              {({ difficulty, label, minMs }, i) => (
                <Swatch
                  class={`difficulty--${difficulty}`}
                  label={`${label} · ${
                    i() === 0
                      ? `${minMs}+ ms`
                      : minMs === 0
                        ? `under ${DIFFICULTY_BANDS[i() - 1].minMs} ms`
                        : `${minMs}–${DIFFICULTY_BANDS[i() - 1].minMs} ms`
                  }`}
                />
              )}
            </For>
            <Swatch class="difficulty--none" label="Can't make it" />
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
