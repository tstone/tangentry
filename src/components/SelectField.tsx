import { Index, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
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
  // Told the option being pointed at, to call it out: the one highlighted
  // in the open list, or the chosen one while the closed field is hovered;
  // null once neither is.
  onHover?: (value: T | null) => void
}

export default function SelectField<T extends string>(props: Props<T>) {
  const collection = createMemo(() => createListCollection({ items: props.options }))
  const [open, setOpen] = createSignal(false)
  const [overField, setOverField] = createSignal(false)
  const [highlighted, setHighlighted] = createSignal<T | null>(null)

  createEffect(() => {
    if (!props.onHover) return
    const pointedAt = open() ? highlighted() : overField() ? props.value : null
    props.onHover(pointedAt)
  })
  onCleanup(() => props.onHover?.(null))

  const highlightHover: { onPointerEnter?: () => void; onPointerLeave?: () => void } = highlightHandlers(
    props.highlight,
  )
  return (
    <Select.Root
      class="select-field"
      onPointerEnter={() => {
        setOverField(true)
        highlightHover.onPointerEnter?.()
      }}
      onPointerLeave={() => {
        setOverField(false)
        highlightHover.onPointerLeave?.()
      }}
      collection={collection()}
      value={[props.value]}
      onValueChange={(details) => {
        const value = details.value[0] as T | undefined
        if (value) props.onChange(value)
      }}
      onOpenChange={(details) => {
        setOpen(details.open)
        if (!details.open) setHighlighted(null)
      }}
      onHighlightChange={(details) => setHighlighted(() => details.highlightedValue as T | null)}
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
