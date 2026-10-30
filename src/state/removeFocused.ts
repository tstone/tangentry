import { focus } from './focus'
import { removeShot, removeVia, shots } from './shots'
import { removeReserved, reserved } from './reserved'
import { extraFlippers, removeExtraFlipper } from './extraFlippers'
import { sketching } from './sketch'
import { smoothing } from './smoothenRun'
import { log } from './log'

/** Whether a sketch or Smoothen run has the playfield, so items can't be added or removed. */
export const busy = () => sketching() || smoothing() !== null

/**
 * Remove whichever shot, custom mech or extra flipper is in focus, if any, or
 * the shot's bend point in focus. With a lane end in focus, which can't be
 * removed, does nothing rather than take the whole shot.
 */
export function removeFocused() {
  const f = focus()
  if (!f || busy()) return
  if (f.kind === 'shot') {
    const shot = shots.find((s) => s.id === f.id)
    if (!shot) return
    if (typeof f.part === 'number') {
      const i = shot.via.findIndex((v) => v.id === f.part)
      if (i < 0) return
      log(`Removed bend point ${i + 1} from ${shot.name}.`)
      removeVia(shot.id, f.part)
      return
    }
    if (f.part !== undefined) return
    log(`Removed ${shot.name}.`)
    removeShot(shot.id)
  } else if (f.kind === 'mech') {
    const area = reserved.find((a) => a.id === f.id)
    if (!area) return
    log(`Removed ${area.name}.`)
    removeReserved(area.id)
  } else {
    const flipper = extraFlippers.find((x) => x.id === f.id)
    if (!flipper) return
    log(`Removed ${flipper.name}.`)
    removeExtraFlipper(flipper.id)
  }
}
