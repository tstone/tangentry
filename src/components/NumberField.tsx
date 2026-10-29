import { createEffect, createSignal } from 'solid-js'
import { NumberInput } from '@ark-ui/solid/number-input'
import type { HighlightKey } from '../state/highlight'
import { highlightHandlers } from './highlightHandlers'

type Props = {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  // Setting to call out on the preview while this field is hovered.
  highlight?: HighlightKey
}

export default function NumberField(props: Props) {
  // Keep the raw text locally so partial input like "20." isn't clobbered,
  // and only push valid numbers out.
  const [text, setText] = createSignal(String(props.value))

  createEffect(() => {
    if (Number(text()) !== props.value) setText(String(props.value))
  })

  return (
    <NumberInput.Root
      class="number-field"
      {...highlightHandlers(props.highlight)}
      value={text()}
      min={props.min}
      max={props.max}
      step={props.step ?? 1}
      onValueChange={(details) => {
        setText(details.value)
        if (Number.isFinite(details.valueAsNumber)) props.onChange(details.valueAsNumber)
      }}
    >
      <NumberInput.Label class="number-field-label">{props.label}</NumberInput.Label>
      <NumberInput.Control class="number-field-control">
        <NumberInput.Input class="number-field-input" />
        {props.unit && <span class="number-field-unit">{props.unit}</span>}
        <div class="number-field-triggers">
          <NumberInput.IncrementTrigger class="number-field-trigger">▴</NumberInput.IncrementTrigger>
          <NumberInput.DecrementTrigger class="number-field-trigger">▾</NumberInput.DecrementTrigger>
        </div>
      </NumberInput.Control>
    </NumberInput.Root>
  )
}
