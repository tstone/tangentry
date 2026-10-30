import { For, createSignal } from 'solid-js'
import { Portal } from 'solid-js/web'
import { Dialog } from '@ark-ui/solid/dialog'
import { Switch } from '@ark-ui/solid/switch'
import { resetProject, type ResetParts } from '../state/project'
import { log } from '../state/log'

const PARTS: { part: keyof ResetParts; label: string; note: string }[] = [
  { part: 'setup', label: 'Setup', note: 'Playfield, flippers, inlanes, ball and walls go back to their defaults. Removes extra flippers and the playfield image.' },
  { part: 'reserved', label: 'Custom mechs', note: 'Removes every custom mech.' },
  { part: 'shots', label: 'Shots', note: 'Removes every shot, including the example the app starts with.' },
]

const ALL: ResetParts = { setup: true, reserved: true, shots: true }

/** Toolbar button opening a dialog to start parts of the project over. */
export default function ResetDialog(props: { disabled?: boolean }) {
  const [open, setOpen] = createSignal(false)
  const [parts, setParts] = createSignal<ResetParts>({ ...ALL })
  const chosen = () => PARTS.filter(({ part }) => parts()[part])

  const reset = () => {
    resetProject(parts())
    log(`Reset ${chosen().map(({ label }) => label.toLowerCase()).join(', ')}.`)
    setOpen(false)
  }

  return (
    <Dialog.Root
      lazyMount
      unmountOnExit
      role="alertdialog"
      open={open()}
      onOpenChange={(details) => {
        setOpen(details.open)
        // Everything is chosen again each time it opens.
        if (details.open) setParts({ ...ALL })
      }}
    >
      <Dialog.Trigger
        class="preview-zoom-button toolbar-icon-button"
        disabled={props.disabled}
        title="Start parts of the project over">
        {/* A trash can. */}
        <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.75 6.5v4.5M9.25 6.5v4.5" />
        </svg>
        Reset
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop class="project-backdrop" />
        <Dialog.Positioner class="project-positioner">
          <Dialog.Content class="reset-dialog">
            <div class="project-header reset-header">
              <Dialog.Title class="project-title">Reset</Dialog.Title>
              <Dialog.CloseTrigger class="icon-button project-close" aria-label="Close">
                ×
              </Dialog.CloseTrigger>
            </div>
            <div class="reset-body">
              <Dialog.Description class="project-note">Start these parts over. This can’t be undone.</Dialog.Description>
              <For each={PARTS}>
                {({ part, label, note }) => (
                  <div class="reset-part">
                    <Switch.Root
                      class="switch-field"
                      checked={parts()[part]}
                      onCheckedChange={(details) => setParts((p) => ({ ...p, [part]: details.checked }))}
                    >
                      <Switch.Label class="switch-field-label">{label}</Switch.Label>
                      <Switch.Control class="switch-field-control">
                        <Switch.Thumb class="switch-field-thumb" />
                      </Switch.Control>
                      <Switch.HiddenInput />
                    </Switch.Root>
                    <p class="field-note">{note}</p>
                  </div>
                )}
              </For>
              <div class="reset-actions">
                <Dialog.CloseTrigger class="wall-mount-add">Cancel</Dialog.CloseTrigger>
                <button type="button" class="wall-mount-add reset-confirm" disabled={chosen().length === 0} onClick={reset}>
                  Reset
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
