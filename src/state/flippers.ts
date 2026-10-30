import { createStore } from 'solid-js/store'
import { inlanes } from './inlanes'
import { coilTorque, flipperInertia, flipperMass, unloadedStrokeTime, type CoilId, type MaterialId } from '../physics/drive'

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
  // Radii of the plastic insert the rubber is stretched around.
  baseRadius: number
  tipRadius: number
  // Overall length of the insert, from the back of the base to the end of
  // the tip.
  length: number
  // Thickness of the rubber ring around the insert. The ball rides on its
  // outer surface.
  rubberThickness: number
  // Coefficient of friction between the rubber and the ball.
  friction: number
  material: MaterialId

  // Motion
  // Angle swept from rest to the up position.
  strokeAngle: number
  coil: CoilId
}

const [flippers, setFlippers] = createStore<Flippers>({
  centerLine: 9,
  pivotFromBottom: 7.5,
  alignment: 'top',
  spacingMode: 'pivots',
  spacing: 7,
  baseRadius: 0.2875,
  tipRadius: 0.0975,
  length: 2.87,
  rubberThickness: 0.15,
  friction: 0.2,
  material: 'plastic',
  strokeAngle: 55,
  coil: 'FL-11630',
})

/** Pivot center to tip center. */
export const centerDistance = () => Math.max(0, flippers.length - flippers.baseRadius - flippers.tipRadius)

/** Radius of the rubber's outer surface around the base, where the ball makes contact. */
export const contactBaseRadius = () => flippers.baseRadius + flippers.rubberThickness

/** Radius of the rubber's outer surface around the tip, where the ball makes contact. */
export const contactTipRadius = () => flippers.tipRadius + flippers.rubberThickness

/** Resistance of the flipper, plunger and linkage to turning, g·in². */
export const inertia = () => flipperInertia(flippers.material, contactBaseRadius(), contactTipRadius(), centerDistance())

/** Mass of the flipper, grams. */
export const mass = () => flipperMass(flippers.material, contactBaseRadius(), contactTipRadius(), centerDistance())

/** Coil torque at the flipper shaft, g·in²/s². */
export const torque = () => coilTorque(flippers.coil)

/** Time to sweep the stroke with no ball on the flipper, milliseconds. */
export const unloadedStrokeMs = () =>
  1000 * unloadedStrokeTime((flippers.strokeAngle * Math.PI) / 180, torque(), inertia())

/**
 * Angle between the flipper's center line and its top/bottom edges, in
 * degrees. The edges converge toward the tip because the tip is smaller.
 */
const edgeAngle = () => {
  // The rubber is the same thickness all round, so it doesn't change the angle.
  const d = centerDistance()
  if (d <= 0) return 0
  const ratio = (flippers.baseRadius - flippers.tipRadius) / d
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

// Horizontal distance from a pivot center to the nearest edge of the tip rubber.
const tipReach = () => centerDistance() * Math.cos((restAngle() * Math.PI) / 180) + contactTipRadius()

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
