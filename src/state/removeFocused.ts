import { focus } from './focus'
import { removeShot, shots } from './shots'
import { removeReserved, reserved } from './reserved'
import { extraFlippers, removeExtraFlipper } from './extraFlippers'
import { sketching } from './sketch'
import { smoothing } from './smoothenRun'
import { log } from './log'

/** Whether a sketch or Smoothen run has the playfield, so items can't be added or removed. */
export const busy = () => sketching() || smoothing() !== null

/** Remove whichever shot, custom mech or extra flipper is in focus, if any. */
export function removeFocused() {
  const f = focus()
  if (!f || busy()) return
  if (f.kind === 'shot') {
    const shot = shots.find((s) => s.id === f.id)
    if (!shot) return
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
