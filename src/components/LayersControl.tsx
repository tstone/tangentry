import { For } from 'solid-js'
import { Switch } from '@ark-ui/solid/switch'
import { LAYERS, showLayer, visible } from '../state/view'

/** Toggles for what's drawn on the preview. Overlaid on the preview. */
export default function LayersControl() {
  return (
    <div class="view-layers" role="group" aria-label="Show">
      <span class="field-label">Show</span>
      <For each={LAYERS}>
        {({ layer, label }) => (
          <Switch.Root
            class="switch-field"
            checked={visible[layer]}
            onCheckedChange={(details) => showLayer(layer, details.checked)}
          >
            <Switch.Label class="switch-field-label">{label}</Switch.Label>
            <Switch.Control class="switch-field-control">
              <Switch.Thumb class="switch-field-thumb" />
            </Switch.Control>
            <Switch.HiddenInput />
          </Switch.Root>
        )}
      </For>
    </div>
  )
}
