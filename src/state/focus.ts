import { createSignal } from 'solid-js'

// The one item the user is working on, if any: a shot, a custom mech or an
// extra flipper. The toolbar's item tools, the playfield's handles and the
// sidebar's cards all follow it.

export type FocusKind = 'shot' | 'mech' | 'flipper'

export type Focus = { kind: FocusKind; id: number }

const [focus, setFocus] = createSignal<Focus | null>(null)

// The item last picked out by the user, as by clicking or adding it. Not
// changed when focus only moves off a removed or replaced item.
const [picked, setPicked] = createSignal<Focus | null>(null, { equals: false })

/** Id of the focused item if it's of this kind, otherwise null. */
export function focusedId(kind: FocusKind) {
  const f = focus()
  return f?.kind === kind ? f.id : null
}

/** Focus an item the user picked out. */
export function focusOn(kind: FocusKind, id: number) {
  const f = focus()
  if (f?.kind !== kind || f.id !== id) setPicked({ kind, id })
  setFocus({ kind, id })
}

/** Let go of the focused item, or only of one of this kind or with this id. */
export function unfocus(kind?: FocusKind, id?: number) {
  const f = focus()
  if (!f || (kind !== undefined && f.kind !== kind) || (id !== undefined && f.id !== id)) return
  setFocus(null)
}

export { focus, picked }
