import { batch, createEffect, createRoot, on } from 'solid-js'
import { ball, setBall, type Ball } from './ball'
import { flippers, setFlippers, type Flippers } from './flippers'
import { inlanes, setInlanes, type Inlanes } from './inlanes'
import { playfield, setPlayfield, type Playfield } from './playfield'
import { walls, setWalls, type Walls } from './walls'
import { clearPlayfieldImage } from './playfieldImage'
import {
  DEFAULT_HORSESHOE,
  replaceShots,
  shots,
  type BallState,
  type Entrance,
  type FlipperKey,
  type OpenSpan,
  type Shot,
  type WallMount,
} from './shots'
import { replaceReserved, reserved, type ReservedArea } from './reserved'
import {
  DEFAULT_ENTRANCE_SPEED,
  extraFlipperKey,
  extraFlippers,
  replaceExtraFlippers,
  type ExtraFlipper,
} from './extraFlippers'
import { COILS, FLIPPER_PROFILES } from '../physics/drive'
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
  // Missing from files saved before flippers could be added.
  extraFlippers?: ExtraFlipper[]
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
    extraFlippers: plain(extraFlippers),
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

const ids = <T extends { id: string }>(list: T[]): T['id'][] => list.map((item) => item.id)

const BALL_STATES: BallState[] = ['inlane', 'cradle']
const EXTRA_FLIPPER = /^extra\d+$/

/**
 * The flipper a shot is made off and how the ball arrives on it. Files saved
 * before shots had a target flipper give an alignment instead, as
 * `${approach}-${ballState}` or `${extraFlipper}-${ballState}`; a backhand
 * comes off the main flipper on the entrance's side of `centerLine`.
 */
function readTarget(s: Json, entrance: Entrance, centerLine: number, path: string) {
  if (s.flipper === undefined) {
    const [key, state] = (typeof s.alignment === 'string' ? s.alignment : '').split('-')
    const ballState = oneOf(state, BALL_STATES, `${path}.alignment`)
    if (key === 'cross') return { flipper: 'auto' as const, ballState }
    if (key === 'backhand') return { flipper: entrance.x < centerLine ? ('left' as const) : ('right' as const), ballState }
    if (EXTRA_FLIPPER.test(key)) return { flipper: key as FlipperKey, ballState: 'inlane' as const }
    throw new Error(`${path}.alignment isn't a ball path.`)
  }
  const flipper =
    typeof s.flipper === 'string' && EXTRA_FLIPPER.test(s.flipper)
      ? (s.flipper as FlipperKey)
      : oneOf(s.flipper, ['auto', 'left', 'right'] as const, `${path}.flipper`)
  return { flipper, ballState: oneOf(s.ballState, BALL_STATES, `${path}.ballState`) }
}

function readExtraFlipper(input: unknown, path: string): ExtraFlipper {
  const f = object(input, path)
  const id = number(f.id, `${path}.id`)
  return {
    id,
    name: typeof f.name === 'string' ? f.name : `Extra Flipper ${id}`,
    pivot: point(f.pivot, `${path}.pivot`),
    side: oneOf(f.side, ['left', 'right'] as const, `${path}.side`),
    profile: oneOf(f.profile, ids(FLIPPER_PROFILES), `${path}.profile`),
    restAngle: number(f.restAngle, `${path}.restAngle`),
    // Missing from files saved while extra flippers were fired from rest.
    entranceSpeed: f.entranceSpeed === undefined ? DEFAULT_ENTRANCE_SPEED : number(f.entranceSpeed, `${path}.entranceSpeed`),
  }
}

function readShot(input: unknown, path: string, centerLine: number): Shot {
  const s = object(input, path)
  const entrance = point(s.entrance, `${path}.entrance`)
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
  // Missing from files saved before lanes could feed one another.
  const feed = s.feed ?? null
  if (feed !== null && !isNumber(feed)) throw new Error(`${path}.feed should be a shot id or null.`)
  if (s.funnelLength !== null && !isNumber(s.funnelLength)) throw new Error(`${path}.funnelLength should be a number or null.`)

  return {
    id: number(s.id, `${path}.id`),
    name: typeof s.name === 'string' ? s.name : `Shot ${s.id}`,
    entrance,
    entranceWidth: number(s.entranceWidth, `${path}.entranceWidth`),
    exitWidth: number(s.exitWidth, `${path}.exitWidth`),
    exit: { ...point(s.exit, `${path}.exit`), angle: number(object(s.exit, `${path}.exit`).angle, `${path}.exit.angle`) },
    continuity: oneOf(s.continuity, ['g1', 'g2'] as const, `${path}.continuity`),
    entranceWeight: number(s.entranceWeight, `${path}.entranceWeight`),
    exitWeight: number(s.exitWeight, `${path}.exitWeight`),
    ...readTarget(s, entrance, centerLine, path),
    entranceOffset: number(s.entranceOffset, `${path}.entranceOffset`),
    leadIn: number(s.leadIn, `${path}.leadIn`),
    funnelLength: s.funnelLength ?? Infinity,
    via: s.via.map((v, i) => ({
      id: number(object(v, `${path}.via[${i}]`).id, `${path}.via[${i}].id`),
      ...point(v, `${path}.via[${i}]`),
    })),
    mounts: { left: readMounts('left'), right: readMounts('right') },
    link: s.link,
    feed,
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
    // Missing from files saved before lanes could have open spans.
    openSpans: readOpenSpans(s.openSpans, `${path}.openSpans`),
  }
}

function readOpenSpans(input: unknown, path: string): OpenSpan[] {
  if (input === undefined) return []
  if (!Array.isArray(input)) throw new Error(`${path} should be a list.`)
  return input.map((g, i) => {
    const span = object(g, `${path}[${i}]`)
    return { from: number(span.from, `${path}[${i}].from`), to: number(span.to, `${path}[${i}].to`) }
  })
}

function readReserved(input: unknown, path: string): ReservedArea {
  const r = object(input, path)
  const id = number(r.id, `${path}.id`)
  const name = typeof r.name === 'string' ? r.name : `Custom Mech ${id}`
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

  // Files saved before profiles gave the standard flipper's dimensions.
  const nextFlippers = section({ profile: 'modern-standard', ...object(file.flippers, 'flippers') }, flippers, 'flippers', {
    alignment: ['top', 'centered', 'flopped'],
    spacingMode: ['pivots', 'tips'],
    profile: ids(FLIPPER_PROFILES),
    coil: ids(COILS),
  })
  const next = {
    playfield: section(file.playfield, playfield, 'playfield'),
    flippers: nextFlippers,
    inlanes: section(file.inlanes, inlanes, 'inlanes'),
    ball: section(file.ball, ball, 'ball'),
    walls: section(file.walls, walls, 'walls', { material: ids(WALL_MATERIALS) }),
    shots: (() => {
      if (!Array.isArray(file.shots)) throw new Error('shots should be a list.')
      return file.shots.map((s, i) => readShot(s, `shots[${i}]`, nextFlippers.centerLine))
    })(),
    reserved: (() => {
      if (file.reserved === undefined) return []
      if (!Array.isArray(file.reserved)) throw new Error('reserved should be a list.')
      return file.reserved.map((r, i) => readReserved(r, `reserved[${i}]`))
    })(),
    extraFlippers: (() => {
      if (file.extraFlippers === undefined) return []
      if (!Array.isArray(file.extraFlippers)) throw new Error('extraFlippers should be a list.')
      return file.extraFlippers.map((f, i) => readExtraFlipper(f, `extraFlippers[${i}]`))
    })(),
  }

  // A join or feed only holds if both lanes made it into the file, and a
  // shot off an extra flipper only if that flipper did.
  const present = new Set(next.shots.map((s) => s.id))
  if (present.size !== next.shots.length) throw new Error('Two shots share an id.')
  const flipperKeys = new Set<string>(next.extraFlippers.map((f) => extraFlipperKey(f.id)))
  const shotList = next.shots.map((s) => ({
    ...s,
    link: s.link !== null && present.has(s.link) ? s.link : null,
    feed: s.feed !== null && present.has(s.feed) ? s.feed : null,
    flipper: s.flipper.startsWith('extra') && !flipperKeys.has(s.flipper) ? ('auto' as const) : s.flipper,
  }))

  batch(() => {
    setPlayfield(next.playfield)
    setFlippers(next.flippers)
    setInlanes(next.inlanes)
    setBall(next.ball)
    setWalls(next.walls)
    replaceExtraFlippers(next.extraFlippers)
    replaceShots(shotList)
    replaceReserved(next.reserved)
  })
}

// Captured as the app starts, before anything is changed or restored.
const DEFAULT_PROJECT = exportProject()

export type ResetParts = { setup: boolean; reserved: boolean; shots: boolean }

/**
 * Start parts of the project over. Setup goes back to how the app starts out
 * and drops the playfield image; reserved areas and shots are cleared, as
 * the shot the app starts with is only there as an example.
 */
export function resetProject(parts: ResetParts) {
  batch(() => {
    if (parts.setup) {
      setPlayfield(plain(DEFAULT_PROJECT.playfield))
      setFlippers(plain(DEFAULT_PROJECT.flippers))
      setInlanes(plain(DEFAULT_PROJECT.inlanes))
      setBall(plain(DEFAULT_PROJECT.ball))
      setWalls(plain(DEFAULT_PROJECT.walls))
      replaceExtraFlippers([])
      clearPlayfieldImage()
    }
    if (parts.reserved) replaceReserved([])
    if (parts.shots) replaceShots([])
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
