import { createEffect, createRoot, on } from 'solid-js'
import { exportProjectJson, importProject } from './project'
import { keepFocus, type Focus } from './focus'
import { shots } from './shots'
import { reserved } from './reserved'
import { extraFlippers } from './extraFlippers'
import { busy } from './removeFocused'
import { log } from './log'

// Undo and redo, kept as snapshots of the project file: anything that
// changes what's saved can be stepped back through, and nothing else (the
// playfield image, the view, focus) is. Not kept between visits.

// Oldest steps are dropped past this many.
const MAX_STEPS = 100
// A run of keypresses, or a slider nudged by the arrow keys, settles into
// one step once it pauses this long.
const SETTLE_MS = 400

const undoStack: string[] = []
const redoStack: string[] = []
// The project as of the last step.
let current = ''
let timer: ReturnType<typeof setTimeout> | undefined
// A drag is one step, so nothing's recorded while a pointer is down.
let pressed = false

/** Record the project as a step, if it's changed since the last one. */
function commit() {
  clearTimeout(timer)
  timer = undefined
  const json = exportProjectJson()
  if (json === current) return
  undoStack.push(current)
  if (undoStack.length > MAX_STEPS) undoStack.shift()
  redoStack.length = 0
  current = json
}

const settleSoon = () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    if (!pressed) commit()
  }, SETTLE_MS)
}

/** Where focus was, if that item and part are still there after a step. */
function settle(f: Focus): Focus | null {
  if (f.kind === 'mech') return reserved.some((a) => a.id === f.id) ? f : null
  if (f.kind === 'flipper') return extraFlippers.some((x) => x.id === f.id) ? f : null
  const shot = shots.find((s) => s.id === f.id)
  if (!shot) return null
  if (typeof f.part === 'number' && !shot.via.some((v) => v.id === f.part)) return { kind: f.kind, id: f.id }
  return f
}

/** Move one step from `from` onto `to`, putting where the project is now on `to`. */
function step(from: string[], to: string[], name: string) {
  if (busy()) return
  // Take in a change still settling, so it's what gets stepped back over.
  commit()
  const json = from.pop()
  if (json === undefined) return
  to.push(current)
  keepFocus(() => importProject(json), settle)
  // Read back what was loaded, so it's not taken for a change of its own.
  current = exportProjectJson()
  log(`${name}.`)
}

export const undo = () => step(undoStack, redoStack, 'Undo')
export const redo = () => step(redoStack, undoStack, 'Redo')

// Fields that keep their own undo for what's typed into them.
const TEXT_FIELD =
  'textarea, [contenteditable], input:not([type="range"], [type="checkbox"], [type="radio"], [type="button"], [type="submit"])'

/**
 * Start recording steps from the project as it is, and take Cmd/Ctrl+Z to
 * undo and Shift+Cmd/Ctrl+Z to redo. Call once at startup, after the saved
 * project is restored.
 */
export function trackHistory() {
  current = exportProjectJson()

  window.addEventListener('pointerdown', () => (pressed = true), true)
  const release = () => {
    pressed = false
    settleSoon()
  }
  window.addEventListener('pointerup', release, true)
  window.addEventListener('pointercancel', release, true)

  window.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== 'z' || e.defaultPrevented) return
    const target = e.target as HTMLElement | null
    if (target?.closest(TEXT_FIELD)) return
    if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return
    e.preventDefault()
    if (e.shiftKey) redo()
    else undo()
  })

  createRoot(() => {
    // Serializing reads every field, so this reruns on any change.
    createEffect(on(exportProjectJson, (json) => json !== current && settleSoon(), { defer: true }))
  })
}
