import * as CFB from 'cfb'
import { md2 } from './md2'

// A Visual Pinball X table (.vpx): an OLE compound file. Table settings are
// in GameStg/GameData and each part of the table (wall, ramp, flipper...)
// in its own GameStg/GameItemN stream. Both are lists of BIFF records: a
// 32-bit length, a four-letter tag, then the data, the tag counted in the
// length. GameStg/MAC holds an MD2 hash of the table settings, which
// Visual Pinball checks on load.

// Game item types, the 32-bit number each GameItem stream starts with.
export const ITEM_RAMP = 12
export const ITEM_FLIPPER = 1

export type BiffRecord = { tag: string; data: Uint8Array }

export type GameItem = { type: number; records: BiffRecord[] }

const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff)

/**
 * The records in `bytes` from `offset`. Nested blocks (a ramp's drag points)
 * come out flat, with their closing ENDB, so they write back unchanged. The
 * script's CODE record stores its length after the tag rather than before:
 * it comes back as one record holding just the script. A FONT record is
 * followed by a font saved in its own format, which comes back as its data.
 */
export function readRecords(bytes: Uint8Array, offset = 0): BiffRecord[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const records: BiffRecord[] = []
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset, true)
    const tag = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    if (tag === 'CODE') {
      const codeLength = view.getUint32(offset + 8, true)
      records.push({ tag, data: bytes.subarray(offset + 12, offset + 12 + codeLength) })
      offset += 12 + codeLength
      continue
    }
    if (tag === 'FONT') {
      // Version, character set, flags, weight and size, then the name, its length first.
      const fontLength = 11 + bytes[offset + 18]
      records.push({ tag, data: bytes.subarray(offset + 8, offset + 8 + fontLength) })
      offset += 8 + fontLength
      continue
    }
    records.push({ tag, data: bytes.subarray(offset + 8, offset + 4 + length) })
    offset += 4 + length
  }
  return records
}

/** One record as written to a stream. */
function recordBytes({ tag, data }: BiffRecord): Uint8Array {
  const code = tag === 'CODE'
  const out = new Uint8Array(8 + (code ? 4 : 0) + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, code || tag === 'FONT' ? 4 : 4 + data.length, true)
  out.set(latin1(tag), 4)
  if (code) view.setUint32(8, data.length, true)
  out.set(data, code ? 12 : 8)
  return out
}

const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

export const writeRecords = (records: BiffRecord[]) => concat(records.map(recordBytes))

// Record data builders.
const bytesOf = (size: number, fill: (view: DataView) => void) => {
  const out = new Uint8Array(size)
  fill(new DataView(out.buffer))
  return out
}
export const float = (v: number) => bytesOf(4, (d) => d.setFloat32(0, v, true))
export const int = (v: number) => bytesOf(4, (d) => d.setInt32(0, v, true))
export const vec2 = (x: number, y: number) =>
  bytesOf(8, (d) => {
    d.setFloat32(0, x, true)
    d.setFloat32(4, y, true)
  })
const withLength = (data: Uint8Array) => concat([int(data.length), data])
/** A one-byte-per-character string, length first. */
export const string = (s: string) => withLength(latin1(s))
/** A UTF-16 string, length in bytes first, as item names are stored. */
export const wideString = (s: string) =>
  withLength(new Uint8Array(Uint16Array.from(s, (c) => c.charCodeAt(0)).buffer))

// Record data readers.
const viewOf = (data: Uint8Array) => new DataView(data.buffer, data.byteOffset, data.byteLength)
export const readFloat = (data: Uint8Array) => viewOf(data).getFloat32(0, true)
export const readString = (data: Uint8Array) => String.fromCharCode(...data.subarray(4))
export const readWideString = (data: Uint8Array) =>
  String.fromCharCode(...new Uint16Array(data.slice(4).buffer))

/** Data of the first record tagged `tag`. */
export const recordData = (records: BiffRecord[], tag: string) => records.find((r) => r.tag === tag)?.data

/** Replace the data of the first record tagged `tag`, if there is one. */
export function setRecord(records: BiffRecord[], tag: string, data: Uint8Array) {
  const record = records.find((r) => r.tag === tag)
  if (record) record.data = data
}

export const itemName = (item: GameItem) => {
  const data = recordData(item.records, 'NAME')
  return data ? readWideString(data) : ''
}

export type Table = {
  file: CFB.CFB$Container
  gameData: BiffRecord[]
  items: GameItem[]
}

const PREFIX = 'Root Entry/'

function stream(file: CFB.CFB$Container, path: string): Uint8Array | null {
  const index = file.FullPaths.indexOf(PREFIX + path)
  const content = index < 0 ? null : file.FileIndex[index].content
  return content ? Uint8Array.from(content) : null
}

/** Open a .vpx file. Throws if it isn't one. */
export function readTable(bytes: Uint8Array): Table {
  const file = CFB.read(bytes, { type: 'array' })
  const gameData = stream(file, 'GameStg/GameData')
  if (!gameData) throw new Error('That isn’t a Visual Pinball X table.')
  const items: GameItem[] = []
  for (let i = 0; ; i++) {
    const item = stream(file, `GameStg/GameItem${i}`)
    if (!item) break
    items.push({ type: viewOf(item).getUint32(0, true), records: readRecords(item, 4) })
  }
  return { file, gameData: readRecords(gameData), items }
}

function put(file: CFB.CFB$Container, path: string, content: Uint8Array) {
  CFB.utils.cfb_del(file, PREFIX + path)
  CFB.utils.cfb_add(file, PREFIX + path, content)
}

/**
 * The table as a .vpx file: its game items renumbered in order, the item
 * count and settings written back, and the table signed again.
 */
export function writeTable(table: Table): Uint8Array {
  const { file, gameData, items } = table
  for (let i = 0; stream(file, `GameStg/GameItem${i}`); i++) CFB.utils.cfb_del(file, `${PREFIX}GameStg/GameItem${i}`)
  items.forEach((item, i) => put(file, `GameStg/GameItem${i}`, concat([int(item.type), writeRecords(item.records)])))
  setRecord(gameData, 'SEDT', int(items.length))
  put(file, 'GameStg/GameData', writeRecords(gameData))
  put(file, 'GameStg/MAC', mac(file))
  return new Uint8Array(CFB.write(file, { type: 'array' }))
}

// Table info streams in the order they're hashed. The save date and
// revision are left out.
const HASHED_INFO = [
  'TableName',
  'AuthorName',
  'TableVersion',
  'ReleaseDate',
  'AuthorEmail',
  'AuthorWebSite',
  'TableBlurb',
  'TableDescription',
  'TableRules',
  'Screenshot',
]

/**
 * The table's signature, as Visual Pinball computes it when saving: MD2 over
 * a key, the version, the table info, the custom info tags with their
 * values, the settings and the collections. Records are hashed as tag and
 * data, without their length. Game items, images and sounds aren't hashed.
 */
function mac(file: CFB.CFB$Container): Uint8Array {
  const parts: Uint8Array[] = [latin1('Visual Pinball')]
  const add = (data: Uint8Array | null) => data && parts.push(data)
  const addRecords = (data: Uint8Array | null, customTags = false) => {
    for (const { tag, data: d } of readRecords(data ?? new Uint8Array())) {
      parts.push(latin1(tag), d)
      if (customTags && tag === 'CUST') add(stream(file, `TableInfo/${readString(d)}`))
    }
  }
  add(stream(file, 'GameStg/Version'))
  for (const name of HASHED_INFO) add(stream(file, `TableInfo/${name}`))
  addRecords(stream(file, 'GameStg/CustomInfoTags'), true)
  addRecords(stream(file, 'GameStg/GameData'))
  for (let i = 0; stream(file, `GameStg/Collection${i}`); i++) addRecords(stream(file, `GameStg/Collection${i}`))
  return md2(concat(parts))
}
