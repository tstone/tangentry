import { createStore } from 'solid-js/store'

// All dimensions are in inches, angles in degrees.
export type Playfield = {
  width: number
  height: number
  // Incline of the playfield in the cabinet.
  angle: number
  // Wood or metal strip down each side, which the ball can't use.
  sideRail: number
}

// Standard-body playfield.
const [playfield, setPlayfield] = createStore<Playfield>({
  width: 20.25,
  height: 45,
  angle: 6.5,
  sideRail: 0.5,
})

export { playfield, setPlayfield }
