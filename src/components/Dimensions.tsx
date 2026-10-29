import { Show } from 'solid-js'
import type { Point } from '../geometry/flipper'

// Annotation primitives for the preview. All sizes are in inches (SVG user units).

const EXTENSION_GAP = 0.15
const EXTENSION_OVERSHOOT = 0.2
const LABEL_OFFSET = 0.45

export const formatInches = (value: number) => `${+value.toFixed(3)}″`
export const formatDegrees = (value: number) => `${+value.toFixed(1)}°`

/** Arrowhead marker definitions; render once inside the SVG's <defs>. */
export function DimensionMarkers() {
  return (
    <marker
      id="dim-arrow"
      viewBox="0 0 10 10"
      refX={10}
      refY={5}
      markerUnits="userSpaceOnUse"
      markerWidth={0.35}
      markerHeight={0.35}
      orient="auto-start-reverse"
    >
      <path d="M 0 0 L 10 5 L 0 10 Z" class="dim-arrowhead" />
    </marker>
  )
}

export function Label(props: { at: Point; text: string }) {
  return (
    <text class="dim-label" x={props.at.x} y={props.at.y} text-anchor="middle" dominant-baseline="middle">
      {props.text}
    </text>
  )
}

/**
 * A linear dimension from `a` to `b`. `offset` moves the dimension line off
 * the measured points, perpendicular to a→b (positive is to the right of the
 * direction of travel in screen space), with extension lines back to them.
 */
export function LinearDimension(props: {
  a: Point
  b: Point
  offset?: number
  label: string
  arrows?: 'both' | 'end'
}) {
  const geometry = () => {
    const dx = props.b.x - props.a.x
    const dy = props.b.y - props.a.y
    const length = Math.hypot(dx, dy) || 1
    const n = { x: -dy / length, y: dx / length }
    const offset = props.offset ?? 0
    const sign = offset < 0 ? -1 : 1
    const shift = (p: Point, d: number) => ({ x: p.x + n.x * d, y: p.y + n.y * d })
    return {
      offset,
      a: shift(props.a, offset),
      b: shift(props.b, offset),
      extA: [shift(props.a, sign * EXTENSION_GAP), shift(props.a, offset + sign * EXTENSION_OVERSHOOT)],
      extB: [shift(props.b, sign * EXTENSION_GAP), shift(props.b, offset + sign * EXTENSION_OVERSHOOT)],
      label: shift(
        { x: (props.a.x + props.b.x) / 2, y: (props.a.y + props.b.y) / 2 },
        offset + sign * LABEL_OFFSET,
      ),
    }
  }

  return (
    <g class="dimension">
      <Show when={geometry().offset !== 0}>
        <line class="dim-extension" x1={geometry().extA[0].x} y1={geometry().extA[0].y} x2={geometry().extA[1].x} y2={geometry().extA[1].y} vector-effect="non-scaling-stroke" />
        <line class="dim-extension" x1={geometry().extB[0].x} y1={geometry().extB[0].y} x2={geometry().extB[1].x} y2={geometry().extB[1].y} vector-effect="non-scaling-stroke" />
      </Show>
      <line
        class="dim-line"
        x1={geometry().a.x}
        y1={geometry().a.y}
        x2={geometry().b.x}
        y2={geometry().b.y}
        marker-start={props.arrows === 'end' ? undefined : 'url(#dim-arrow)'}
        marker-end="url(#dim-arrow)"
        vector-effect="non-scaling-stroke"
      />
      <Label at={geometry().label} text={props.label} />
    </g>
  )
}

/**
 * An angle dimension: an arc around `center` from angle `from` to `to`
 * (radians, SVG coordinates), with a dashed reference line along `from`.
 */
export function AngleDimension(props: {
  center: Point
  from: number
  to: number
  radius: number
  label: string
}) {
  const at = (angle: number, r: number) => ({
    x: props.center.x + r * Math.cos(angle),
    y: props.center.y + r * Math.sin(angle),
  })

  const arc = () => {
    const start = at(props.from, props.radius)
    const end = at(props.to, props.radius)
    const large = Math.abs(props.to - props.from) > Math.PI ? 1 : 0
    const sweep = props.to > props.from ? 1 : 0
    return `M ${start.x} ${start.y} A ${props.radius} ${props.radius} 0 ${large} ${sweep} ${end.x} ${end.y}`
  }

  const reference = () => at(props.from, props.radius + EXTENSION_OVERSHOOT * 2)

  return (
    <g class="dimension">
      <line
        class="dim-extension dim-reference"
        x1={props.center.x}
        y1={props.center.y}
        x2={reference().x}
        y2={reference().y}
        vector-effect="non-scaling-stroke"
      />
      <path class="dim-line" d={arc()} marker-end="url(#dim-arrow)" vector-effect="non-scaling-stroke" />
      <Label at={at((props.from + props.to) / 2, props.radius + LABEL_OFFSET + 0.2)} text={props.label} />
    </g>
  )
}
