import { Show, createSignal } from 'solid-js'
import { Portal } from 'solid-js/web'
import { Dialog } from '@ark-ui/solid/dialog'
import { DownloadTrigger } from '@ark-ui/solid/download-trigger'
import { FileUpload } from '@ark-ui/solid/file-upload'
import { Tabs } from '@ark-ui/solid/tabs'
import { exportProjectJson, importProject } from '../state/project'
import { log } from '../state/log'

const FILE_NAME = 'tangentry.json'

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
                <div class="project-export-bar">
                  <p class="project-note">All settings and shot positions, as JSON.</p>
                  <DownloadTrigger
                    class="wall-mount-add"
                    fileName={FILE_NAME}
                    mimeType="application/json"
                    data={exportProjectJson}
                  >
                    Download {FILE_NAME}
                  </DownloadTrigger>
                </div>
                <pre class="project-json">{exportProjectJson()}</pre>
              </Tabs.Content>
            </Tabs.Root>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
