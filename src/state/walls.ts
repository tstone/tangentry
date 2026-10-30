import { createStore } from 'solid-js/store'
import type { WallSpec } from '../physics/wall'

export type Walls = WallSpec & {
  // Fraction of the ball's speed into a lane wall that it bounces back with
  // where the wall can't flex, as right at a spade bolt. Steel on steel.
  restitution: number
}

const [walls, setWalls] = createStore<Walls>({
  material: 'ss304',
  thickness: 0.06,
  height: 1.25,
  restitution: 0.8,
  spadeStiffness: 10000,
  spikeStiffness: 1500,
})

export { walls, setWalls }
