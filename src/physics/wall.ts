import type { Point } from '../geometry/flipper'

// Lane walls are thin steel strips standing on edge, held to the playfield
// at a few mount points. Between mounts the strip flexes sideways when the
// ball hits it. Some of the ball's energy goes into setting the wall
// flexing and is lost, so a hit between mounts bounces back less than a hit
// right at a mount.
//
// Units: inches, seconds and grams, so forces are g·in/s².

// One pound-force in g·in/s².
const LBF = 175_127

export type MountKind = 'spade' | 'spike'

export const MOUNT_KINDS: { id: MountKind; label: string }[] = [
  { id: 'spade', label: 'Spade bolt' },
  { id: 'spike', label: 'Spike' },
]

export type WallMaterialId = 'ss304'

type WallMaterial = {
  id: WallMaterialId
  label: string
  // Young's modulus, psi.
  modulus: number
}

export const WALL_MATERIALS: WallMaterial[] = [
  { id: 'ss304', label: '304 stainless steel', modulus: 28e6 },
]

export type WallSpec = {
  material: WallMaterialId
  thickness: number
  height: number
  // Sideways stiffness of each kind of mount, lbf/in.
  spadeStiffness: number
  spikeStiffness: number
}

// A spade bolt is riveted flat to the wall, so it also resists the wall
// turning about it, lbf·in/rad. A spike only stops the wall moving sideways.
const SPADE_TWIST_STIFFNESS = 2000
// The wall's bottom edge resting on the playfield gives a little support
// everywhere, lbf/in per inch of wall. Keeps a wall with no mounts solvable.
const BEARING_STIFFNESS = 1
// Friction as the wall flexes, lbf·s/in. A guess, set so a hit midway along
// a 12" wall held only at its ends keeps about 60% of its speed, a hit
// beside a spike about 90%, and one at a spade bolt about 95%.
const WALL_DAMPING = 0.06
// Shortest beam element, so folded walls don't divide by zero.
const MIN_ELEMENT = 1e-3

const material = (id: WallMaterialId) => WALL_MATERIALS.find((m) => m.id === id)!

export type Mount = { index: number; kind: MountKind }

// Half-bandwidth of the stiffness matrix: each node has a sideways and a
// turning freedom, and a beam element links two neighboring nodes.
const BAND = 3

/**
 * Sideways stiffness at each point of a wall (g/s²), from bending of the
 * strip between its mounts. The wall is treated as a straight beam the
 * length of its outline; its curvature, which stiffens it, is ignored.
 */
export function wallStiffness(wall: Point[], mounts: Mount[], spec: WallSpec): number[] {
  const nodes = wall.length
  const n = 2 * nodes
  const m = material(spec.material)
  const ei = m.modulus * LBF * ((spec.height * spec.thickness ** 3) / 12)

  const lengths: number[] = []
  for (let i = 0; i < nodes - 1; i++) {
    lengths.push(Math.max(MIN_ELEMENT, Math.hypot(wall[i + 1].x - wall[i].x, wall[i + 1].y - wall[i].y)))
  }
  // Each node carries half of each element beside it.
  const share = (i: number) => ((lengths[i - 1] ?? 0) + (lengths[i] ?? 0)) / 2

  // Banded symmetric matrix: a[i·(BAND+1) + d] is entry (i, i−d).
  const width = BAND + 1
  const a = new Float64Array(n * width)
  const addEntry = (i: number, j: number, value: number) => {
    if (j > i) [i, j] = [j, i]
    a[i * width + (i - j)] += value
  }
  lengths.forEach((l, e) => {
    const k = ei / l ** 3
    const local = [
      [12, 6 * l, -12, 6 * l],
      [6 * l, 4 * l * l, -6 * l, 2 * l * l],
      [-12, -6 * l, 12, -6 * l],
      [6 * l, 2 * l * l, -6 * l, 4 * l * l],
    ]
    for (let r = 0; r < 4; r++) for (let c = 0; c <= r; c++) addEntry(2 * e + r, 2 * e + c, k * local[r][c])
  })
  for (let i = 0; i < nodes; i++) addEntry(2 * i, 2 * i, BEARING_STIFFNESS * LBF * share(i))
  for (const mount of mounts) {
    const i = Math.min(nodes - 1, Math.max(0, mount.index))
    if (mount.kind === 'spade') {
      addEntry(2 * i, 2 * i, spec.spadeStiffness * LBF)
      addEntry(2 * i + 1, 2 * i + 1, SPADE_TWIST_STIFFNESS * LBF)
    } else {
      addEntry(2 * i, 2 * i, spec.spikeStiffness * LBF)
    }
  }

  // Cholesky factorization in place.
  const at = (i: number, j: number) => a[i * width + (i - j)]
  for (let i = 0; i < n; i++) {
    for (let j = Math.max(0, i - BAND); j <= i; j++) {
      let sum = at(i, j)
      for (let k = Math.max(0, i - BAND); k < j; k++) sum -= at(i, k) * at(j, k)
      a[i * width + (i - j)] = i === j ? Math.sqrt(sum) : sum / at(j, j)
    }
  }

  const x = new Float64Array(n)
  return wall.map((_, node) => {
    // Unit sideways push at this node.
    x.fill(0)
    x[2 * node] = 1
    for (let i = 0; i < n; i++) {
      let sum = x[i]
      for (let k = Math.max(0, i - BAND); k < i; k++) sum -= at(i, k) * x[k]
      x[i] = sum / at(i, i)
    }
    for (let i = n - 1; i >= 0; i--) {
      let sum = x[i]
      for (let k = i + 1; k <= Math.min(n - 1, i + BAND); k++) sum -= at(k, i) * x[k]
      x[i] = sum / at(i, i)
    }
    return 1 / x[2 * node]
  })
}

/**
 * Fraction of its speed into the wall that the ball keeps when it hits a
 * point of the wall with the given stiffness (g/s²), from the wall flexing
 * alone. The wall acts as a spring with a damper: the ball pushes the wall
 * aside and is pushed back, losing energy to friction as the wall flexes
 * (its bottom edge scrubbing the playfield, the mounts working). The softer
 * the wall, the further it flexes and the more is lost. Losses in the
 * steel-on-steel contact itself are left to the caller's restitution.
 */
export function flexRestitution(stiffness: number, ballMass: number) {
  const damping = WALL_DAMPING * LBF
  const ratio = damping / (2 * Math.sqrt(stiffness * ballMass))
  if (ratio >= 1) return 0
  return Math.exp((-Math.PI * ratio) / Math.sqrt(1 - ratio * ratio))
}
