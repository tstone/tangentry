import { For, Match, Show, Switch as Branch, createSignal, onCleanup } from 'solid-js'
import { createStore } from 'solid-js/store'
import { Portal } from 'solid-js/web'
import { Dialog } from '@ark-ui/solid/dialog'
import { DownloadTrigger } from '@ark-ui/solid/download-trigger'
import { FileUpload } from '@ark-ui/solid/file-upload'
import { Switch } from '@ark-ui/solid/switch'
import { Tabs } from '@ark-ui/solid/tabs'
import { exportProjectJson, importProject } from '../state/project'
import { DRAWING_PARTS, exportDxf, exportSvg, type DrawingPart } from '../state/drawingExport'
import { log } from '../state/log'

const FILE_NAME = 'tangentry.json'

type ExportFormat = 'json' | 'dxf' | 'svg'

const FORMATS: { label: string; note: string; value: ExportFormat }[] = [
  { label: 'DXF', note: 'Drawing for CAD', value: 'dxf' },
  { label: 'SVG', note: 'Vector drawing', value: 'svg' },
  { label: 'JSON', note: 'Project file, to import later', value: 'json' },
]

// How long the copy button says "Copied", milliseconds.
const COPIED_MS = 1500

// Kept while the dialog is closed, so the next export starts from the same choices.
const [format, setFormat] = createSignal<ExportFormat>('dxf')
const [drawingParts, setDrawingParts] = createStore<Record<DrawingPart, boolean>>({
  playfield: true,
  lanes: true,
  laneCenters: false,
  paths: false,
  flippers: true,
  mechs: true,
})

function CopyButton(props: { text: () => string }) {
  const [copied, setCopied] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => clearTimeout(timer))
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.text())
      setCopied(true)
      clearTimeout(timer)
      timer = setTimeout(() => setCopied(false), COPIED_MS)
    } catch {
      log('Couldn’t copy the project to the clipboard.')
    }
  }
  return (
    <button type="button" class="wall-mount-add" onClick={copy}>
      {copied() ? 'Copied' : 'Copy'}
    </button>
  )
}

function JsonExport() {
  return (
    <>
      <div class="project-export-bar">
        <p class="project-note">All settings and shot positions, as JSON.</p>
        <div class="project-export-actions">
          <CopyButton text={exportProjectJson} />
          <DownloadTrigger class="wall-mount-add" fileName={FILE_NAME} mimeType="application/json" data={exportProjectJson}>
            Download {FILE_NAME}
          </DownloadTrigger>
        </div>
      </div>
      <pre class="project-json">{exportProjectJson()}</pre>
    </>
  )
}

type DrawingFormat = {
  fileName: string
  mimeType: string
  note: string
  write: (parts: Record<DrawingPart, boolean>) => string
}

// Drawings of the playfield, which share the choice of what goes in them.
const DRAWINGS: Record<'dxf' | 'svg', DrawingFormat> = {
  dxf: {
    fileName: 'tangentry.dxf',
    mimeType: 'application/dxf',
    note: 'A drawing for CAD, in inches, with each part on its own layer.',
    write: exportDxf,
  },
  svg: {
    fileName: 'tangentry.svg',
    mimeType: 'image/svg+xml',
    note: 'A vector drawing at full size, in inches, with each part on its own layer.',
    write: exportSvg,
  },
}

function DrawingExport(props: { drawing: DrawingFormat }) {
  const nothingChosen = () => DRAWING_PARTS.every(({ part }) => !drawingParts[part])
  return (
    <>
      <div class="project-export-bar">
        <p class="project-note">{props.drawing.note}</p>
        <DownloadTrigger
          class="wall-mount-add"
          fileName={props.drawing.fileName}
          mimeType={props.drawing.mimeType}
          data={() => props.drawing.write(drawingParts)}
          disabled={nothingChosen()}
        >
          Download {props.drawing.fileName}
        </DownloadTrigger>
      </div>
      <div class="project-drawing-parts">
        <For each={DRAWING_PARTS}>
          {({ part, label, note }) => (
            <div class="reset-part">
              <Switch.Root
                class="switch-field"
                checked={drawingParts[part]}
                onCheckedChange={(details) => setDrawingParts(part, details.checked)}
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
      </div>
    </>
  )
}

/** Button overlaid bottom right of the preview, opening a full-screen dialog to import or export the project. */
export default function ProjectDialog() {
  const [open, setOpen] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const load = async (file: File) => {
    try {
      importProject(await file.text())
      log(`Imported project ${file.name}.`)
      setOpen(false)
    } catch (e) {
      setError(`${file.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    // Unmounted while closed, so the upload starts fresh each time it opens.
    <Dialog.Root
      lazyMount
      unmountOnExit
      open={open()}
      onOpenChange={(details) => {
        setOpen(details.open)
        setError(null)
      }}
    >
      <Dialog.Trigger class="preview-zoom-button project-trigger">Import / Export</Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop class="project-backdrop" />
        <Dialog.Positioner class="project-positioner">
          <Dialog.Content class="project-dialog">
            <Tabs.Root class="project-tabs" defaultValue="export">
              <div class="project-header">
                <Dialog.Title class="project-title">Project</Dialog.Title>
                <Tabs.List class="project-tab-list">
                  <Tabs.Trigger class="sidebar-tab" value="import">
                    Import
                  </Tabs.Trigger>
                  <Tabs.Trigger class="sidebar-tab" value="export">
                    Export
                  </Tabs.Trigger>
                  <Tabs.Indicator class="sidebar-tab-indicator" />
                </Tabs.List>
                <Dialog.CloseTrigger class="icon-button project-close" aria-label="Close">
                  ×
                </Dialog.CloseTrigger>
              </div>

              <Tabs.Content class="project-tab-content" value="import">
                <p class="project-note">
                  Load a project from a JSON file. Its settings and shots replace everything currently set up.
                </p>
                <FileUpload.Root
                  class="project-upload"
                  accept={['application/json', '.json']}
                  maxFiles={1}
                  onFileAccept={(details) => {
                    setError(null)
                    const file = details.files[0]
                    if (file) load(file)
                  }}
                  onFileReject={() => setError('Choose a single .json file.')}
                >
                  <FileUpload.Dropzone class="project-dropzone">
                    <span>Drop a JSON file here</span>
                    <FileUpload.Trigger class="wall-mount-add">Choose file</FileUpload.Trigger>
                  </FileUpload.Dropzone>
                  <FileUpload.HiddenInput />
                </FileUpload.Root>
                <Show when={error()}>{(message) => <p class="project-error">{message()}</p>}</Show>
              </Tabs.Content>

              <Tabs.Content class="project-tab-content" value="export">
                <div class="project-formats" role="radiogroup" aria-label="Format">
                  <For each={FORMATS}>
                    {({ label, note, value }) => (
                      <button
                        type="button"
                        role="radio"
                        class="project-format"
                        aria-checked={format() === value}
                        onClick={() => setFormat(value)}
                      >
                        <span class="project-format-label">{label}</span>
                        <span class="project-format-note">{note}</span>
                      </button>
                    )}
                  </For>
                </div>
                <Branch>
                  <Match when={format() === 'json'}>
                    <JsonExport />
                  </Match>
                  <Match when={format() === 'dxf'}>
                    <DrawingExport drawing={DRAWINGS.dxf} />
                  </Match>
                  <Match when={format() === 'svg'}>
                    <DrawingExport drawing={DRAWINGS.svg} />
                  </Match>
                </Branch>
              </Tabs.Content>
            </Tabs.Root>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
