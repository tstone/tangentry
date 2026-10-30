import { createSignal } from 'solid-js'
import type { ShotEnd } from './shots'

// The one item the user is working on, if any: a shot, a custom mech or an
// extra flipper. The toolbar's item tools, the playfield's handles and the
// sidebar's cards all follow it.

export type FocusKind = 'shot' | 'mech' | 'flipper'

// A part of the focused item picked out on its own, as a shot's end or one of
// its bend points by id. Escape and Delete act on it before the item.
export type FocusPart = ShotEnd | number

export type Focus = { kind: FocusKind; id: number; part?: FocusPart }

const [focus, setFocus] = createSignal<Focus | null>(null)

// The item last picked out by the user, as by clicking or adding it. Not
// changed when focus only moves off a removed or replaced item, or between
// parts of the same item.
const [picked, setPicked] = createSignal<Focus | null>(null, { equals: false })

/** Id of the focused item if it's of this kind, otherwise null. */
export function focusedId(kind: FocusKind) {
  const f = focus()
  return f?.kind === kind ? f.id : null
}

/** The focused part of this item, if it's the one in focus and has one. */
export function focusedPart(kind: FocusKind, id: number) {
  const f = focus()
  return f?.kind === kind && f.id === id ? (f.part ?? null) : null
}

/** Focus an item the user picked out, or one of its parts. */
export function focusOn(kind: FocusKind, id: number, part?: FocusPart) {
  const f = focus()
  if (f?.kind !== kind || f.id !== id) setPicked({ kind, id })
  setFocus({ kind, id, part })
}

/** Let go of the focused item, or only of one of this kind or with this id. */
export function unfocus(kind?: FocusKind, id?: number) {
  const f = focus()
  if (!f || (kind !== undefined && f.kind !== kind) || (id !== undefined && f.id !== id)) return
  setFocus(null)
}

/**
 * Let go of the focused part, keeping its item in focus, or only of this part
 * of this item. Whether there was one to let go of.
 */
export function unfocusPart(kind?: FocusKind, id?: number, part?: FocusPart) {
  const f = focus()
  if (!f || f.part === undefined) return false
  if ((kind !== undefined && f.kind !== kind) || (id !== undefined && f.id !== id)) return false
  if (part !== undefined && f.part !== part) return false
  setFocus({ kind: f.kind, id: f.id })
  return true
}

/** Step focus back one level: off its part if it has one, otherwise off the item. */
export function stepBack() {
  if (!unfocusPart()) unfocus()
}

export { focus, picked }
