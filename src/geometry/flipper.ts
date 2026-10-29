export type Point = { x: number; y: number }

/**
 * Outline of a flipper: a base circle and a tip circle joined by their outer
 * tangent lines. `angle` is the direction from base to tip in radians, in SVG
 * coordinates (y down).
 */
export function flipperPath(
  base: Point,
  baseRadius: number,
  tipRadius: number,
  length: number,
  angle: number,
): string {
  const R = baseRadius
  const r = tipRadius
  const tip = { x: base.x + length * Math.cos(angle), y: base.y + length * Math.sin(angle) }

  // One circle contains the other: just draw the larger one.
  if (length <= Math.abs(R - r)) {
    const c = R >= r ? base : tip
    const rr = Math.max(R, r)
    return `M ${c.x - rr} ${c.y} a ${rr} ${rr} 0 1 0 ${rr * 2} 0 a ${rr} ${rr} 0 1 0 ${-rr * 2} 0 Z`
  }

  // Angle between the center line and the tangent points' radii.
  const alpha = Math.acos((R - r) / length)
  const on = (c: Point, radius: number, a: number) =>
    `${c.x + radius * Math.cos(a)} ${c.y + radius * Math.sin(a)}`

  const a1 = angle + alpha
  const a2 = angle - alpha
  // Tip arc spans 2α around the tip; base arc spans the remaining 2π − 2α.
  const tipLarge = alpha > Math.PI / 2 ? 1 : 0
  const baseLarge = 1 - tipLarge

  return [
    `M ${on(base, R, a1)}`,
    `L ${on(tip, r, a1)}`,
    `A ${r} ${r} 0 ${tipLarge} 0 ${on(tip, r, a2)}`,
    `L ${on(base, R, a2)}`,
    `A ${R} ${R} 0 ${baseLarge} 0 ${on(base, R, a1)}`,
    'Z',
  ].join(' ')
}

/** Pivot positions for a symmetric pair of flippers. */
export function flipperPivots(centerLine: number, pivotY: number, pivotSpacing: number) {
  return {
    left: { x: centerLine - pivotSpacing / 2, y: pivotY },
    right: { x: centerLine + pivotSpacing / 2, y: pivotY },
  }
}

/**
 * The inlane guide surface feeding a flipper: a straight segment at `angle`
 * (radians below horizontal) that ends tangent to the top of the flipper's
 * base circle. `side` is which flipper it feeds.
 */
export function inlaneGuide(
  pivot: Point,
  baseRadius: number,
  angle: number,
  length: number,
  side: 'left' | 'right',
): { start: Point; end: Point } {
  const sx = side === 'left' ? 1 : -1
  // Direction of travel (down toward the flipper) and the upward normal.
  const dir = { x: sx * Math.cos(angle), y: Math.sin(angle) }
  const normal = { x: sx * Math.sin(angle), y: -Math.cos(angle) }
  const end = { x: pivot.x + baseRadius * normal.x, y: pivot.y + baseRadius * normal.y }
  return {
    start: { x: end.x - length * dir.x, y: end.y - length * dir.y },
    end,
  }
}
