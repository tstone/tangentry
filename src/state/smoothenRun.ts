import { createSignal } from 'solid-js'
import { shots } from './shots'
import { smoothen, type SmoothenResult } from './smoothen'
import { log } from './log'

// One Smoothen run at a time, started from the toolbar, with its outcome
// written to the log.

// The shot being smoothed and the lane shapes tried out of the most the
// search will try, while it runs.
const [smoothing, setSmoothing] = createSignal<{ shotId: number; tried: number; most: number } | null>(null)

const paths = (n: number) => `${n} ball path${n === 1 ? '' : 's'}`

/** What a smoothen run did, in a line. */
function summary(r: SmoothenResult) {
  if (!r.changed) return r.stale ? 'the lane changed meanwhile, so nothing was applied.' : "couldn't find anything smoother."
  const rough =
    r.before !== r.after ? `rough ${paths(r.before)} down to ${r.after}.` : `hits softened; ${paths(r.after)} still not smooth.`
  return r.addedVia ? `${rough} Added a bend point to lead into the horseshoe.` : rough
}

export async function runSmoothen(shotId: number) {
  if (smoothing()) return
  const name = shots.find((s) => s.id === shotId)?.name ?? 'shot'
  setSmoothing({ shotId, tried: 0, most: 1 })
  try {
    const r = await smoothen(shotId, (tried, most) => setSmoothing({ shotId, tried, most }))
    if (r) log(`Smoothen ${name}: ${summary(r)}`)
  } finally {
    setSmoothing(null)
  }
}

export { smoothing }
