import { Show, createSignal, type JSX } from 'solid-js'

type Props = {
  name: string
  selected: boolean
  // Shown beside the name.
  summary?: JSX.Element
  onSelect: () => void
  onRename: (name: string) => void
}

/**
 * A card's name, which selects the card when clicked. Double-clicking turns
 * it into a text field: Enter or clicking away saves, Escape cancels.
 */
export default function CardName(props: Props) {
  const [editing, setEditing] = createSignal(false)

  const finish = (input: HTMLInputElement, save: boolean) => {
    if (!editing()) return
    setEditing(false)
    const name = input.value.trim()
    if (save && name) props.onRename(name)
  }

  return (
    <Show
      when={editing()}
      fallback={
        <button
          type="button"
          class="shot-select"
          aria-pressed={props.selected}
          title="Double-click to rename"
          onClick={() => props.onSelect()}
          onDblClick={() => setEditing(true)}
        >
          <span class="shot-name">{props.name}</span>
          <Show when={props.summary}>
            <span class="shot-summary">{props.summary}</span>
          </Show>
        </button>
      }
    >
      <input
        ref={(input) =>
          queueMicrotask(() => {
            input.focus()
            input.select()
          })
        }
        class="card-name-input"
        type="text"
        aria-label="Name"
        value={props.name}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finish(e.currentTarget, true)
          else if (e.key === 'Escape') finish(e.currentTarget, false)
        }}
        onBlur={(e) => finish(e.currentTarget, true)}
      />
    </Show>
  )
}
