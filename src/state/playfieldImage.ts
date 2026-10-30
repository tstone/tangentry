import { createStore } from 'solid-js/store'
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
  }
  probe.onerror = () => URL.revokeObjectURL(src)
  probe.src = src
}

export function clearPlayfieldImage() {
  if (playfieldImage.src) URL.revokeObjectURL(playfieldImage.src)
  setPlayfieldImage({ src: null, name: '' })
}

export { playfieldImage, setPlayfieldImage }
