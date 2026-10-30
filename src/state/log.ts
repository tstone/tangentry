import { createSignal } from 'solid-js'

// A running list of what's been done to the project this session, newest
// last. Not saved with the project.

export type LogEntry = {
  id: number
  time: Date
  text: string
  // Marks the entry with a color, such as the sketch color a shot came from.
  color?: string
}

// Oldest entries are dropped past this many.
const MAX_ENTRIES = 200

let nextId = 1
const [entries, setEntries] = createSignal<LogEntry[]>([])

export function log(text: string, color?: string) {
  setEntries((list) => [...list, { id: nextId++, time: new Date(), text, color }].slice(-MAX_ENTRIES))
}

export const clearLog = () => setEntries([])

export { entries as logEntries }
