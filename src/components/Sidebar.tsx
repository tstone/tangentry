import { Tabs } from '@ark-ui/solid/tabs'
import SetupTab from './SetupTab'
import ShotsTab from './ShotsTab'

export default function Sidebar() {
  return (
    <Tabs.Root class="sidebar" defaultValue="setup">
      <Tabs.List class="sidebar-tabs">
        <Tabs.Trigger class="sidebar-tab" value="setup">
          Setup
        </Tabs.Trigger>
        <Tabs.Trigger class="sidebar-tab" value="shots">
          Shots
        </Tabs.Trigger>
        <Tabs.Indicator class="sidebar-tab-indicator" />
      </Tabs.List>
      <Tabs.Content class="sidebar-tab-content" value="setup">
        <SetupTab />
      </Tabs.Content>
      <Tabs.Content class="sidebar-tab-content" value="shots">
        <ShotsTab />
      </Tabs.Content>
    </Tabs.Root>
  )
}
