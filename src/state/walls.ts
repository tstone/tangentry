import { createStore } from 'solid-js/store'

export type Walls = {
  // Fraction of the ball's speed into a lane wall that it bounces back with.
  // Roughly 0.5–0.7 for a steel ball on metal or wood guides.
  restitution: number
}

const [walls, setWalls] = createStore<Walls>({
  restitution: 0.6,
})

export { walls, setWalls }
