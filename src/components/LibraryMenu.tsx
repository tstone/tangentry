import { For } from 'solid-js'
import { Portal } from 'solid-js/web'
import { Menu } from '@ark-ui/solid/menu'
import { importProject } from '../state/project'
import { log } from '../state/log'
import aiq from '../library/aiq.json?raw'

// Ready-made designs to start from, each a project file.
const DESIGNS: { value: string; label: string; hint: string; json: string }[] = [
  { value: 'aiq', label: 'AIQ', hint: 'Replaces the current design', json: aiq },
]

/** Toolbar button opening a menu of ready-made designs; picking one replaces the project (undoable). */
export default function LibraryMenu(props: { disabled?: boolean }) {
  const load = (value: string) => {
    const design = DESIGNS.find((d) => d.value === value)
    if (!design) return
    try {
      importProject(design.json)
      log(`Loaded ${design.label} from the library.`)
    } catch (e) {
      log(`Couldn't load ${design.label}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <Menu.Root positioning={{ placement: 'right-start', gutter: 6 }} onSelect={(details) => load(details.value)}>
      <Menu.Trigger
        class="preview-zoom-button toolbar-icon-button"
        title="Replace the design with one from the library"
        disabled={props.disabled}
      >
        {/* Books on a shelf. */}
        <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 13.5h11M3.5 13.5v-10h2.5v10M6 13.5v-8h2.5v8M9.5 13.3l-1-7.6 2.4-.4 1.6 7.7" />
        </svg>
        Library
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content class="menu-content">
            <For each={DESIGNS}>
              {(design) => (
                <Menu.Item value={design.value} class="menu-item">
                  <span>{design.label}</span>
                  <span class="menu-item-hint">{design.hint}</span>
                </Menu.Item>
              )}
            </For>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  )
}
