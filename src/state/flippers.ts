import { createStore } from 'solid-js/store'
import { inlanes } from './inlanes'

// How the horizontal spacing of the flipper pair is specified.
export type SpacingMode = 'pivots' | 'tips'

// Which part of the flipper lines up with the inlane guide at rest.
// 'flopped' aligns the bottom edge.
export type Alignment = 'top' | 'centered' | 'flopped'

// All dimensions are in inches, angles in degrees.
export type Flippers = {
  // Position
  // Vertical center line, measured from the left edge of the playfield.
  centerLine: number
  // Flipper pivots, measured up from the bottom lip of the playfield.
  pivotFromBottom: number
  alignment: Alignment
  spacingMode: SpacingMode
  // Pivot center to pivot center ('pivots'), or the gap between the tip
  // edges at rest ('tips').
  spacing: number

  // Type
  baseRadius: number
  tipRadius: number
  // Pivot center to tip center.
  length: number
}

const [flippers, setFlippers] = createStore<Flippers>({
  centerLine: 9,
  pivotFromBottom: 7.5,
  alignment: 'top',
  spacingMode: 'pivots',
  spacing: 7,
  baseRadius: 0.5,
  tipRadius: 0.25,
  length: 2.25,
})

/**
 * Angle between the flipper's center line and its top/bottom edges, in
 * degrees. The edges converge toward the tip because the tip is smaller.
 */
const edgeAngle = () => {
  const ratio = (flippers.baseRadius - flippers.tipRadius) / flippers.length
  return (Math.asin(Math.max(-1, Math.min(1, ratio))) * 180) / Math.PI
}

/** Resting angle below horizontal, derived from the inlane angle and alignment. */
export const restAngle = () => {
  switch (flippers.alignment) {
    case 'top':
      return inlanes.angle - edgeAngle()
    case 'centered':
      return inlanes.angle
    case 'flopped':
      return inlanes.angle + edgeAngle()
  }
}

// Horizontal distance from a pivot center to the nearest edge of the tip.
const tipReach = () =>
  flippers.length * Math.cos((restAngle() * Math.PI) / 180) + flippers.tipRadius

/** Distance between the pivot centers, whichever way spacing is specified. */
export const pivotSpacing = () =>
  flippers.spacingMode === 'pivots' ? flippers.spacing : flippers.spacing + 2 * tipReach()

/** Switch spacing mode, converting the value so the flippers don't move. */
export function setSpacingMode(mode: SpacingMode) {
  if (mode === flippers.spacingMode) return
  const pivots = pivotSpacing()
  const spacing = mode === 'pivots' ? pivots : pivots - 2 * tipReach()
  setFlippers({
    spacingMode: mode,
    // Round to the nearest thousandth so the field stays readable.
    spacing: Math.round(spacing * 1000) / 1000,
  })
}

export { flippers, setFlippers }
