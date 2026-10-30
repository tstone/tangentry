import { Splitter } from '@ark-ui/solid/splitter'
import Sidebar from './components/Sidebar'
import Preview from './components/Preview'

export default function App() {
  return (
    <Splitter.Root
      class="app"
      defaultSize={[26.5, 73.5]}
      panels={[
        { id: 'sidebar', minSize: 15, maxSize: 45 },
        { id: 'preview' },
      ]}
    >
      <Splitter.Panel id="sidebar" class="app-panel">
        {/* The splitter hides panel overflow, so the sidebar scrolls inside its own box. */}
        <div class="app-panel-scroll">
          <Sidebar />
        </div>
      </Splitter.Panel>
      <Splitter.ResizeTrigger id="sidebar:preview" class="app-resize" aria-label="Resize sidebar" />
      <Splitter.Panel id="preview" class="app-panel">
        <Preview />
      </Splitter.Panel>
    </Splitter.Root>
  )
}
