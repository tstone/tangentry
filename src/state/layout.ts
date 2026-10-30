import { playfield } from './playfield'
import { centerDistance, contactBaseRadius, flippers, pivotSpacing, restAngle } from './flippers'
import { inlanes } from './inlanes'
import { flipperPivots, inlaneGuide, type Point } from '../geometry/flipper'

// Approximate length of the inlane guide feeding each flipper, in inches.
export const INLANE_LENGTH = 4.5

export const toRadians = (degrees: number) => (degrees * Math.PI) / 180

export type Side = 'left' | 'right'

export type FlipperLayout = {
  side: Side
  pivot: Point
  tip: Point
  // Direction from pivot to tip, radians in SVG coordinates (y down).
  angle: number
  // Inlane guide feeding this flipper.
  guide: { start: Point; end: Point }
  // Direction of travel down the inlane, radians in SVG coordinates.
  inlaneAngle: number
}

/**
 * Resolved positions of everything on the playfield, in SVG coordinates
 * (inches, origin top-left, y down). Reads the stores, so call it inside a
 * reactive scope.
 */
export function computeLayout(): { flippers: FlipperLayout[] } {
  const rest = toRadians(restAngle())
  const inlane = toRadians(inlanes.angle)
  // SVG y grows downward, so measurements from the bottom lip are flipped.
  const pivots = flipperPivots(flippers.centerLine, playfield.height - flippers.pivotFromBottom, pivotSpacing())

  const side = (side: Side): FlipperLayout => {
    const pivot = pivots[side]
    // Both flippers point down toward the center line.
    const angle = side === 'left' ? rest : Math.PI - rest
    return {
      side,
      pivot,
      tip: {
        x: pivot.x + centerDistance() * Math.cos(angle),
        y: pivot.y + centerDistance() * Math.sin(angle),
      },
      angle,
      guide: inlaneGuide(pivot, contactBaseRadius(), inlane, INLANE_LENGTH, side),
      inlaneAngle: side === 'left' ? inlane : Math.PI - inlane,
    }
  }

  return { flippers: [side('left'), side('right')] }
}
