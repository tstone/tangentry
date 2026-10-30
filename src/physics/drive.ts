// What drives the flipper and how hard it is to swing. Masses are in grams,
// lengths in inches, so inertia is g·in² and torque is g·in²/s².

export type CoilId = 'FL-11753' | 'FL-11722' | 'FL-11630' | 'FL-15411' | 'FL-11629'

export type Coil = {
  id: CoilId
  label: string
  // Power winding resistance, ohms, without the diode.
  resistance: number
}

// Williams/Bally flipper coils, weakest to strongest. Resistances are the
// published power winding values.
export const COILS: Coil[] = [
  { id: 'FL-11753', label: 'FL-11753 (yellow, low)', resistance: 9.8 },
  { id: 'FL-11722', label: 'FL-11722 (green, medium low)', resistance: 6.2 },
  { id: 'FL-11630', label: 'FL-11630 (red, standard)', resistance: 4.7 },
  { id: 'FL-15411', label: 'FL-15411 (orange, medium strong)', resistance: 4.2 },
  { id: 'FL-11629', label: 'FL-11629 (blue, high)', resistance: 4.0 },
]

export type MaterialId = 'plastic'

export type Material = {
  id: MaterialId
  label: string
  // Mass of a full-size flipper (bat, shaft and rubber) in this material.
  referenceMass: number
}

export const MATERIALS: Material[] = [
  // Measured: a full-size plastic flipper with its shaft and natural rubber weighs 1.2 oz.
  { id: 'plastic', label: 'Plastic', referenceMass: 1.2 * 28.3495 },
]

// Outline of the full-size flipper the reference masses were measured on:
// outer radii of the rubber at base and tip, and pivot to tip center.
const REFERENCE_SHAPE = { baseRadius: 0.2875 + 0.15, tipRadius: 0.0975 + 0.15, length: 2.87 - 0.2875 - 0.0975 }

// Estimated equivalent inertia of the coil plunger and linkage, felt at the
// flipper shaft: roughly a 60 g plunger on a 0.5″ crank arm. Not measured.
const MECHANISM_INERTIA = 16

// The standard red coil is calibrated to sweep a full-size plastic flipper
// through 55° in 17 ms with no ball on it. In this model that fires a ball
// from rest at the flipper's sweet spot at about 100 in/s (2.5 m/s), between
// filmed up-the-table shots (~2.2 m/s) and estimated top speeds (~4 m/s).
const REFERENCE_STROKE = (55 * Math.PI) / 180
const REFERENCE_STROKE_TIME = 0.017
const REFERENCE_COIL = COILS.find((c) => c.id === 'FL-11630')!

/**
 * Area and polar second moment of area about the pivot of a flipper outline:
 * base and tip circles joined by their outer tangents, pivot at the origin.
 */
function outline(baseRadius: number, tipRadius: number, length: number) {
  const R = baseRadius
  const r = tipRadius
  // Angle of the tangent points on each circle, from the center line.
  const alpha = Math.acos(Math.max(-1, Math.min(1, (R - r) / Math.max(length, 1e-9))))
  const points: [number, number][] = []
  const SEGMENTS = 120
  for (let i = 0; i <= SEGMENTS; i++) {
    const a = -alpha + (2 * alpha * i) / SEGMENTS
    points.push([length + r * Math.cos(a), r * Math.sin(a)])
  }
  for (let i = 0; i <= SEGMENTS; i++) {
    const a = alpha + ((2 * Math.PI - 2 * alpha) * i) / SEGMENTS
    points.push([R * Math.cos(a), R * Math.sin(a)])
  }
  let area = 0
  let polar = 0
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[(i + 1) % points.length]
    const c = x0 * y1 - x1 * y0
    area += c / 2
    polar += (c * (x0 * x0 + x0 * x1 + x1 * x1 + y0 * y0 + y0 * y1 + y1 * y1)) / 12
  }
  return { area, polar }
}

const REFERENCE_OUTLINE = outline(REFERENCE_SHAPE.baseRadius, REFERENCE_SHAPE.tipRadius, REFERENCE_SHAPE.length)

/**
 * Resistance of the flipper, plunger and linkage to turning, g·in². The
 * flipper's mass is spread evenly over its outline, scaled from the
 * reference flipper by area.
 */
export function flipperInertia(material: MaterialId, baseRadius: number, tipRadius: number, length: number) {
  const density = MATERIALS.find((m) => m.id === material)!.referenceMass / REFERENCE_OUTLINE.area
  return density * outline(baseRadius, tipRadius, length).polar + MECHANISM_INERTIA
}

/** Mass of the flipper, grams. */
export function flipperMass(material: MaterialId, baseRadius: number, tipRadius: number, length: number) {
  const density = MATERIALS.find((m) => m.id === material)!.referenceMass / REFERENCE_OUTLINE.area
  return density * outline(baseRadius, tipRadius, length).area
}

const REFERENCE_TORQUE =
  (2 * REFERENCE_STROKE * flipperInertia('plastic', REFERENCE_SHAPE.baseRadius, REFERENCE_SHAPE.tipRadius, REFERENCE_SHAPE.length)) /
  (REFERENCE_STROKE_TIME * REFERENCE_STROKE_TIME)

/**
 * Torque a coil applies at the flipper shaft, held constant through the
 * stroke. For windings filling the same bobbin, solenoid force goes roughly
 * as 1/resistance, so coils are scaled from the red one by that.
 */
export function coilTorque(coil: CoilId) {
  const resistance = COILS.find((c) => c.id === coil)!.resistance
  return REFERENCE_TORQUE * (REFERENCE_COIL.resistance / resistance)
}

/** Time to sweep `stroke` radians with no ball on the flipper, seconds. */
export const unloadedStrokeTime = (stroke: number, torque: number, inertia: number) =>
  Math.sqrt((2 * stroke * inertia) / torque)

// Steel, g/cm³, and cubic centimeters per cubic inch.
const STEEL_DENSITY = 7.85
const CM3_PER_IN3 = 16.387

/** Mass of a solid steel ball of the given diameter in inches, grams. */
export const ballMass = (diameter: number) => ((Math.PI / 6) * diameter ** 3 * CM3_PER_IN3 * STEEL_DENSITY)
