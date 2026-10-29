import { Index, createMemo } from 'solid-js'
import { Portal } from 'solid-js/web'
import { Select, createListCollection } from '@ark-ui/solid/select'
import type { HighlightKey } from '../state/highlight'
import { highlightHandlers } from './highlightHandlers'

type Option<T extends string> = { label: string; value: T }

type Props<T extends string> = {
  label: string
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  // Setting to call out on the preview while this field is hovered.
  highlight?: HighlightKey
}

export default function SelectField<T extends string>(props: Props<T>) {
  const collection = createMemo(() => createListCollection({ items: props.options }))

  return (
    <Select.Root
      class="select-field"
      {...highlightHandlers(props.highlight)}
      collection={collection()}
      value={[props.value]}
      onValueChange={(details) => {
        const value = details.value[0] as T | undefined
        if (value) props.onChange(value)
      }}
      positioning={{ sameWidth: true }}
    >
      <Select.Label class="field-label">{props.label}</Select.Label>
      <Select.Control>
        <Select.Trigger class="select-field-trigger">
          <Select.ValueText />
          <Select.Indicator class="select-field-indicator">▾</Select.Indicator>
        </Select.Trigger>
      </Select.Control>
      <Portal>
        <Select.Positioner>
          <Select.Content class="select-field-content">
            <Index each={collection().items}>
              {(item) => (
                <Select.Item item={item()} class="select-field-item">
                  <Select.ItemText>{item().label}</Select.ItemText>
                </Select.Item>
              )}
            </Index>
          </Select.Content>
        </Select.Positioner>
      </Portal>
      <Select.HiddenSelect />
    </Select.Root>
  )
}
