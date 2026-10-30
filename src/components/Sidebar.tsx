import { createEffect, createSignal, on } from 'solid-js'
import { Tabs } from '@ark-ui/solid/tabs'
import { picked } from '../state/focus'
import SetupTab from './SetupTab'
import ReservedTab from './ReservedTab'
import ShotsTab from './ShotsTab'
import AnalysisTab from './AnalysisTab'

export default function Sidebar() {
  const [tab, setTab] = createSignal('shots')
  // Picking out an item brings up its settings, or a shot's analysis if that's showing.
  createEffect(
    on(
      picked,
      (item) => {
        if (item?.kind === 'shot' && tab() !== 'analysis') setTab('shots')
        else if (item?.kind === 'mech') setTab('reserved')
        else if (item?.kind === 'flipper') setTab('setup')
      },
      { defer: true },
    ),
  )
  return (
    <Tabs.Root class="sidebar" value={tab()} onValueChange={(details) => setTab(details.value)}>
      <Tabs.List class="sidebar-tabs">
        <Tabs.Trigger class="sidebar-tab" value="setup">
          Setup
        </Tabs.Trigger>
        <Tabs.Trigger class="sidebar-tab" value="reserved">
          Mechs
        </Tabs.Trigger>
        <Tabs.Trigger class="sidebar-tab" value="shots">
          Shots
        </Tabs.Trigger>
        <Tabs.Trigger class="sidebar-tab" value="analysis">
          Analysis
        </Tabs.Trigger>
        <Tabs.Indicator class="sidebar-tab-indicator" />
      </Tabs.List>
      <Tabs.Content class="sidebar-tab-content" value="setup">
        <SetupTab />
      </Tabs.Content>
      <Tabs.Content class="sidebar-tab-content" value="reserved">
        <ReservedTab />
      </Tabs.Content>
      <Tabs.Content class="sidebar-tab-content" value="shots">
        <ShotsTab />
      </Tabs.Content>
      <Tabs.Content class="sidebar-tab-content" value="analysis">
        <AnalysisTab />
      </Tabs.Content>
    </Tabs.Root>
  )
}
