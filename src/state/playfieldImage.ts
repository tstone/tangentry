import { createEffect, createRoot } from 'solid-js'
import { createStore } from 'solid-js/store'
import { deleteFile, getFile, putFile } from './fileStore'
import { playfield } from './playfield'

// A picture of the playfield (artwork, a scan, a CAD export) traced over.
// Dimensions are in inches.
export type PlayfieldImage = {
  // Object URL of the uploaded file, or null when there's no image.
  src: string | null
  name: string
  // Height over width of the image as uploaded, kept so it never stretches.
  aspect: number
  width: number
  // Lower-left corner of the image, from the playfield's left edge and up
  // from its bottom lip.
  x: number
  y: number
  opacity: number
}

const [playfieldImage, setPlayfieldImage] = createStore<PlayfieldImage>({
  src: null,
  name: '',
  aspect: 1,
  width: 0,
  x: 0,
  y: 0,
  opacity: 0.5,
})

export const imageHeight = () => playfieldImage.width * playfieldImage.aspect

/** Size the image to fit inside the playfield, centered across it and sitting on the bottom lip. */
export function fitPlayfieldImage() {
  // Rounded to hundredths, so the fields read cleanly and step evenly.
  const round = (value: number) => Math.round(value * 100) / 100
  const width = Math.floor(Math.min(playfield.width, playfield.height / playfieldImage.aspect) * 100) / 100
  setPlayfieldImage({ width, x: round((playfield.width - width) / 2), y: 0 })
}

export function loadPlayfieldImage(file: File) {
  const src = URL.createObjectURL(file)
  const probe = new Image()
  probe.onload = () => {
    if (playfieldImage.src) URL.revokeObjectURL(playfieldImage.src)
    // SVGs without a size of their own report 0 × 0.
    const aspect = probe.naturalWidth && probe.naturalHeight ? probe.naturalHeight / probe.naturalWidth : 1
    setPlayfieldImage({ src, name: file.name, aspect })
    fitPlayfieldImage()
    putFile(FILE_KEY, file).catch((e) => console.warn("Couldn't save the playfield image:", e))
  }
  probe.onerror = () => URL.revokeObjectURL(src)
  probe.src = src
}

export function clearPlayfieldImage() {
  if (playfieldImage.src) URL.revokeObjectURL(playfieldImage.src)
  setPlayfieldImage({ src: null, name: '' })
  deleteFile(FILE_KEY).catch((e) => console.warn("Couldn't remove the saved playfield image:", e))
}

// The image file itself goes in IndexedDB, as it's too big for localStorage;
// where it sits is small and changes often, so that goes in localStorage.
const FILE_KEY = 'playfieldImage'
const STORAGE_KEY = 'tangentry.playfieldImage'

type Placement = Omit<PlayfieldImage, 'src'>

/**
 * Restore the image last used in this browser, then keep it saved as it's
 * moved or replaced. Call once at startup.
 */
export async function persistPlayfieldImage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    const file = saved && (await getFile(FILE_KEY))
    // Skip it if an image was uploaded while this was loading.
    if (file && !playfieldImage.src) {
      setPlayfieldImage({ ...(JSON.parse(saved) as Placement), src: URL.createObjectURL(file) })
    }
  } catch (e) {
    console.warn('Ignoring the saved playfield image:', e)
  }

  // Started only now, so the empty image the app starts with doesn't
  // overwrite the saved one before it's restored.
  createRoot(() => {
    createEffect(() => {
      const { src, ...placement } = playfieldImage
      try {
        if (src) localStorage.setItem(STORAGE_KEY, JSON.stringify(placement))
        else localStorage.removeItem(STORAGE_KEY)
      } catch (e) {
        console.warn("Couldn't save the playfield image placement:", e)
      }
    })
  })
}

export { playfieldImage, setPlayfieldImage }
