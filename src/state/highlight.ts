import { createSignal } from 'solid-js'

// Settings that can be called out on the preview when hovered in the sidebar.
export type HighlightKey =
  | 'playfield.width'
  | 'playfield.height'
  | 'playfield.angle'
  | 'flippers.centerLine'
  | 'flippers.pivotFromBottom'
  | 'flippers.alignment'
  | 'flippers.spacing'
  | 'flippers.baseRadius'
  | 'flippers.tipRadius'
  | 'flippers.length'
  | 'flippers.rubberThickness'
  | 'flippers.strokeAngle'
  | 'inlanes.angle'

const [highlight, setHighlight] = createSignal<HighlightKey | null>(null)

export { highlight, setHighlight }
