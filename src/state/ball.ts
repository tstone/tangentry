import { createStore } from 'solid-js/store'

// Dimensions in inches, speeds in inches per second.
export type Ball = {
  diameter: number
  // Speed of the ball as it enters the top of the inlane.
  inlaneSpeed: number
}

// Standard 1-1/16″ pinball.
const [ball, setBall] = createStore<Ball>({
  diameter: 1.0625,
  inlaneSpeed: 15,
})

export { ball, setBall }
