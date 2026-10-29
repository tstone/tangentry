import { createStore } from 'solid-js/store'

// Angles in degrees.
export type Inlanes = {
  // Angle of the guide that feeds the flipper, below horizontal.
  angle: number
}

const [inlanes, setInlanes] = createStore<Inlanes>({
  angle: 35,
})

export { inlanes, setInlanes }
