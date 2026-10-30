import { batch, createEffect, createRoot, on } from 'solid-js'
import { ball, setBall, type Ball } from './ball'
import { flippers, setFlippers, type Flippers } from './flippers'
import { inlanes, setInlanes, type Inlanes } from './inlanes'
import { playfield, setPlayfield, type Playfield } from './playfield'
import { walls, setWalls, type Walls } from './walls'
import { clearPlayfieldImage } from './playfieldImage'
import { DEFAULT_HORSESHOE, replaceShots, shots, type LaneAlignment, type Shot, type WallMount } from './shots'
import { replaceReserved, reserved, type ReservedArea } from './reserved'
import { COILS, MATERIALS } from '../physics/drive'
import { MOUNT_KINDS, WALL_MATERIALS } from '../physics/wall'

// Everything configurable, saved to and loaded from a file. The playfield
// image isn't included: it only lives in the browser as an object URL.

export const PROJECT_FORMAT = 'tangentry'
// Bump when the file's shape changes in a way older readers can't follow,
// and teach `importProject` to upgrade files from earlier versions.
export const PROJECT_VERSION = 1

export type ProjectFile = {
  format: typeof PROJECT_FORMAT
  version: number
  playfield: Playfield
  flippers: Flippers
  inlanes: Inlanes
  ball: Ball
  walls: Walls
  // JSON has no Infinity, so a funnel spread over the whole lane is null.
  shots: (Omit<Shot, 'funnelLength'> & { funnelLength: number | null })[]
  // Missing from files saved before reserved areas existed.
  reserved?: ReservedArea[]
}

// Deep copy of a store's contents, free of Solid's proxies.
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value))

export function exportProject(): ProjectFile {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    playfield: plain(playfield),
    flippers: plain(flippers),
    inlanes: plain(inlanes),
    ball: plain(ball),
    walls: plain(walls),
    shots: shots.map((shot) => ({
      ...plain(shot),
      funnelLength: Number.isFinite(shot.funnelLength) ? shot.funnelLength : null,
    })),
    reserved: plain(reserved),
  }
}

export const exportProjectJson = () => JSON.stringify(exportProject(), null, 2)

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const object = (value: unknown, path: string): Json => {
  if (!isObject(value)) throw new Error(`${path} is missing or isn't an object.`)
  return value
}

const number = (value: unknown, path: string): number => {
  if (!isNumber(value)) throw new Error(`${path} should be a number.`)
  return value
}

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], path: string): T => {
  if (!allowed.includes(value as T)) throw new Error(`${path} should be one of ${allowed.join(', ')}.`)
  return value as T
}

/**
 * Read a settings section shaped like `current`: every number must be a
 * number, and every string one of `choices` for that key.
 */
function section<T extends object>(input: unknown, current: T, path: string, choices: Partial<Record<keyof T, readonly string[]>> = {}): T {
  const source = object(input, path)
  const out = { ...current }
  for (const key of Object.keys(current) as (keyof T & string)[]) {
    const allowed = choices[key]
    out[key] = (allowed ? oneOf(source[key], allowed, `${path}.${key}`) : number(source[key], `${path}.${key}`)) as T[typeof key]
  }
  return out
}

const point = (input: unknown, path: string) => {
  const p = object(input, path)
  return { x: number(p.x, `${path}.x`), y: number(p.y, `${path}.y`) }
}

const ALIGNMENTS: LaneAlignment[] = ['cross-inlane', 'cross-cradle', 'backhand-inlane', 'backhand-cradle']
const ids = <T extends { id: string }>(list: T[]): T['id'][] => list.map((item) => item.id)

function readShot(input: unknown, path: string): Shot {
  const s = object(input, path)
  const mounts = object(s.mounts, `${path}.mounts`)
  const readMounts = (side: 'left' | 'right'): WallMount[] => {
    const list = mounts[side]
    if (!Array.isArray(list)) throw new Error(`${path}.mounts.${side} should be a list.`)
    return list.map((m, i) => {
      const at = `${path}.mounts.${side}[${i}]`
      const mount = object(m, at)
      return {
        id: number(mount.id, `${at}.id`),
        kind: oneOf(mount.kind, ids(MOUNT_KINDS), `${at}.kind`),
        at: number(mount.at, `${at}.at`),
      }
    })
  }
  if (!Array.isArray(s.via)) throw new Error(`${path}.via should be a list.`)
  if (s.link !== null && !isNumber(s.link)) throw new Error(`${path}.link should be a shot id or null.`)
  if (s.funnelLength !== null && !isNumber(s.funnelLength)) throw new Error(`${path}.funnelLength should be a number or null.`)

  return {
    id: number(s.id, `${path}.id`),
    name: typeof s.name === 'string' ? s.name : `Shot ${s.id}`,
    entrance: point(s.entrance, `${path}.entrance`),
    entranceWidth: number(s.entranceWidth, `${path}.entranceWidth`),
    exitWidth: number(s.exitWidth, `${path}.exitWidth`),
    exit: { ...point(s.exit, `${path}.exit`), angle: number(object(s.exit, `${path}.exit`).angle, `${path}.exit.angle`) },
    continuity: oneOf(s.continuity, ['g1', 'g2'] as const, `${path}.continuity`),
    entranceWeight: number(s.entranceWeight, `${path}.entranceWeight`),
    exitWeight: number(s.exitWeight, `${path}.exitWeight`),
    alignment: oneOf(s.alignment, ALIGNMENTS, `${path}.alignment`),
    entranceOffset: number(s.entranceOffset, `${path}.entranceOffset`),
    leadIn: number(s.leadIn, `${path}.leadIn`),
    funnelLength: s.funnelLength ?? Infinity,
    via: s.via.map((v, i) => ({
      id: number(object(v, `${path}.via[${i}]`).id, `${path}.via[${i}].id`),
      ...point(v, `${path}.via[${i}]`),
    })),
    mounts: { left: readMounts('left'), right: readMounts('right') },
    link: s.link,
    // Missing from files saved before ramps.
    ramp: s.ramp === true,
    // Missing from files saved before lanes could end in a horseshoe.
    end: s.end === undefined ? 'open' : oneOf(s.end, ['open', 'horseshoe'] as const, `${path}.end`),
    horseshoe:
      s.horseshoe === undefined
        ? { ...DEFAULT_HORSESHOE }
        : {
            rotation: number(object(s.horseshoe, `${path}.horseshoe`).rotation, `${path}.horseshoe.rotation`),
            radius: number(object(s.horseshoe, `${path}.horseshoe`).radius, `${path}.horseshoe.radius`),          },
  }
}

function readReserved(input: unknown, path: string): ReservedArea {
  const r = object(input, path)
  const id = number(r.id, `${path}.id`)
  const name = typeof r.name === 'string' ? r.name : `Reserved ${id}`
  // Missing from files saved before areas could be shot at.
  const shootable = r.shootable === true
  if (r.kind === 'circle') {
    return { id, name, shootable, kind: 'circle', center: point(r.center, `${path}.center`), radius: number(r.radius, `${path}.radius`) }
  }
  oneOf(r.kind, ['circle', 'polygon'] as const, `${path}.kind`)
  if (!Array.isArray(r.points)) throw new Error(`${path}.points should be a list.`)
  return {
    id,
    name,
    shootable,
    kind: 'polygon',
    points: r.points.map((p, i) => ({
      id: number(object(p, `${path}.points[${i}]`).id, `${path}.points[${i}].id`),
      ...point(p, `${path}.points[${i}]`),
    })),
  }
}

/**
 * Load a project file's settings and shots into the app, replacing what's
 * there. Throws, leaving everything as it was, if the file can't be read.
 */
export function importProject(json: string) {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error("The file isn't valid JSON.")
  }
  const file = object(data, 'The file')
  if (file.format !== PROJECT_FORMAT) throw new Error("This isn't a Tangentry project file.")
  const version = number(file.version, 'version')
  if (version > PROJECT_VERSION) {
    throw new Error(`This file is from a newer version of Tangentry (format ${version}); this one reads up to ${PROJECT_VERSION}.`)
  }

  const next = {
    playfield: section(file.playfield, playfield, 'playfield'),
    flippers: section(file.flippers, flippers, 'flippers', {
      alignment: ['top', 'centered', 'flopped'],
      spacingMode: ['pivots', 'tips'],
      material: ids(MATERIALS),
      coil: ids(COILS),
    }),
    inlanes: section(file.inlanes, inlanes, 'inlanes'),
    ball: section(file.ball, ball, 'ball'),
    walls: section(file.walls, walls, 'walls', { material: ids(WALL_MATERIALS) }),
    shots: (() => {
      if (!Array.isArray(file.shots)) throw new Error('shots should be a list.')
      return file.shots.map((s, i) => readShot(s, `shots[${i}]`))
    })(),
    reserved: (() => {
      if (file.reserved === undefined) return []
      if (!Array.isArray(file.reserved)) throw new Error('reserved should be a list.')
      return file.reserved.map((r, i) => readReserved(r, `reserved[${i}]`))
    })(),
  }

  // A join only holds if both lanes made it into the file.
  const present = new Set(next.shots.map((s) => s.id))
  if (present.size !== next.shots.length) throw new Error('Two shots share an id.')
  const shotList = next.shots.map((s) => (s.link !== null && !present.has(s.link) ? { ...s, link: null } : s))

  batch(() => {
    setPlayfield(next.playfield)
    setFlippers(next.flippers)
    setInlanes(next.inlanes)
    setBall(next.ball)
    setWalls(next.walls)
    replaceShots(shotList)
    replaceReserved(next.reserved)
  })
}

// Captured as the app starts, before anything is changed or restored.
const DEFAULT_PROJECT_JSON = exportProjectJson()

/** Put every setting and shot back to how the app starts out, and drop the playfield image. */
export function resetProject() {
  batch(() => {
    importProject(DEFAULT_PROJECT_JSON)
    clearPlayfieldImage()
  })
}

const STORAGE_KEY = 'tangentry.project'
// Wait for a drag or a run of keypresses to settle before writing.
const SAVE_DELAY_MS = 300

/**
 * Restore the project last saved in this browser, then keep it saved as
 * anything changes. Call once at startup.
 */
export function persistProject() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) importProject(saved)
  } catch (e) {
    // Unreadable or from a newer version: start from the defaults instead.
    console.warn('Ignoring the saved project:', e)
  }

  let pending: string | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  const save = () => {
    clearTimeout(timer)
    if (pending === null) return
    try {
      localStorage.setItem(STORAGE_KEY, pending)
    } catch (e) {
      console.warn("Couldn't save the project:", e)
    }
    pending = null
  }
  // Don't lose a change made just before the tab closes.
  window.addEventListener('pagehide', save)

  createRoot(() => {
    // Serializing reads every field, so this reruns on any change.
    createEffect(
      on(
        exportProjectJson,
        (json) => {
          pending = json
          clearTimeout(timer)
          timer = setTimeout(save, SAVE_DELAY_MS)
        },
        { defer: true },
      ),
    )
  })
}
