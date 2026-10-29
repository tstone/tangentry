import { setHighlight, type HighlightKey } from '../state/highlight'

/** Pointer handlers that call out `key` on the preview while hovered. */
export function highlightHandlers(key: HighlightKey | undefined) {
  if (!key) return {}
  return {
    onPointerEnter: () => setHighlight(key),
    onPointerLeave: () => setHighlight((current) => (current === key ? null : current)),
  }
}
