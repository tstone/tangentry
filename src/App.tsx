import { Splitter } from '@ark-ui/solid/splitter'
import Sidebar from './components/Sidebar'
import Preview from './components/Preview'

export default function App() {
  return (
    <Splitter.Root
      class="app"
      defaultSize={[22, 78]}
      panels={[
        { id: 'sidebar', minSize: 15, maxSize: 45 },
        { id: 'preview' },
      ]}
    >
      <Splitter.Panel id="sidebar" class="app-panel">
        <Sidebar />
      </Splitter.Panel>
      <Splitter.ResizeTrigger id="sidebar:preview" class="app-resize" aria-label="Resize sidebar" />
      <Splitter.Panel id="preview" class="app-panel">
        <Preview />
      </Splitter.Panel>
    </Splitter.Root>
  )
}
