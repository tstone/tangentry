import { Index, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import { resetView, setCenter, viewBox, viewCenter, zoom, zoomBy, zoomIn, zoomOut } from './previewView'
import { playfield } from '../state/playfield'
import { imageHeight, playfieldImage } from '../state/playfieldImage'
import { centerDistance, contactBaseRadius, contactTipRadius, flippers } from '../state/flippers'
import { highlight } from '../state/highlight'
import { visible } from '../state/view'
import { computeLayout } from '../state/layout'
import { flipperPath } from '../geometry/flipper'
import Annotations from './Annotations'
import { DimensionMarkers } from './Dimensions'
import LayersControl from './LayersControl'
import PathColoringControl from './PathColoringControl'
import ProjectDialog from './ProjectDialog'
import ReservedAreas, { ReservedMarkers } from './ReservedAreas'
import SafeTravel from './SafeTravel'
import ShotLanes, { WallMounts } from './ShotLanes'
import ShotMarkers from './ShotMarkers'
import ShotPaths from './ShotPaths'

// Display radius of the flipper pivot marker, in inches.
const PIVOT_RADIUS = 0.1

// Zoom per pixel of wheel scroll.
const WHEEL_ZOOM = 0.0015

export default function Preview() {
  const layout = createMemo(computeLayout)
  const [panning, setPanning] = createSignal(false)
  let svg!: SVGSVGElement

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const ctm = svg.getScreenCTM()
    return ctm ? new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse()) : viewCenter()
  }

  // Wheel zooms around the cursor. Listened for directly so it can stop the
  // page from scrolling.
  onMount(() => {
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      // Lines and pages scroll further than a pixel.
      const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1)
      zoomBy(Math.exp(-pixels * WHEEL_ZOOM), toSvg(e))
    }
    svg.addEventListener('wheel', wheel, { passive: false })
    onCleanup(() => svg.removeEventListener('wheel', wheel))
  })

  // Dragging anywhere a handle didn't claim pans the view.
  const startPan = (e: PointerEvent) => {
    if (e.defaultPrevented || e.button !== 0) return
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    e.preventDefault()
    svg.setPointerCapture(e.pointerId)
    setPanning(true)
    const from = { x: e.clientX, y: e.clientY }
    const start = viewCenter()
    const move = (m: PointerEvent) =>
      setCenter({ x: start.x - (m.clientX - from.x) / ctm.a, y: start.y - (m.clientY - from.y) / ctm.d })
    const end = () => {
      setPanning(false)
      svg.removeEventListener('pointermove', move)
      svg.removeEventListener('pointerup', end)
      svg.removeEventListener('pointercancel', end)
    }
    svg.addEventListener('pointermove', move)
    svg.addEventListener('pointerup', end)
    svg.addEventListener('pointercancel', end)
  }

  return (
    <div class="preview">
      <svg
        ref={svg}
        class="preview-canvas"
        classList={{ 'is-panning': panning() }}
        viewBox={viewBox()}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={startPan}
      >
        <defs>
          <DimensionMarkers />
        </defs>
        <rect
          class="playfield"
          x={0}
          y={0}
          width={playfield.width}
          height={playfield.height}
          vector-effect="non-scaling-stroke"
        />
        <Show when={playfieldImage.src}>
          {(src) => (
            <image
              class="playfield-image"
              href={src()}
              x={playfieldImage.x}
              y={playfield.height - playfieldImage.y - imageHeight()}
              width={playfieldImage.width}
              height={imageHeight()}
              opacity={playfieldImage.opacity}
              preserveAspectRatio="none"
            />
          )}
        </Show>
        <g
          class="side-rails"
          classList={{ 'is-highlighted': highlight() === 'playfield.sideRail', 'has-image': !!playfieldImage.src }}
        >
          <rect class="side-rail" x={0} y={0} width={playfield.sideRail} height={playfield.height} />
          <rect
            class="side-rail"
            x={playfield.width - playfield.sideRail}
            y={0}
            width={playfield.sideRail}
            height={playfield.height}
          />
        </g>
        {/* The playfield's edge, drawn again above the image. */}
        <rect
          class="playfield-outline"
          x={0}
          y={0}
          width={playfield.width}
          height={playfield.height}
          vector-effect="non-scaling-stroke"
        />
        <line
          class="center-line"
          x1={flippers.centerLine}
          x2={flippers.centerLine}
          y1={0}
          y2={playfield.height}
          vector-effect="non-scaling-stroke"
        />
        <g classList={{ 'is-dimmed': highlight() !== null }}>
          <Index each={layout().flippers}>
            {(f) => (
              <g>
                <line
                  class="inlane-guide"
                  x1={f().guide.start.x}
                  y1={f().guide.start.y}
                  x2={f().guide.end.x}
                  y2={f().guide.end.y}
                  vector-effect="non-scaling-stroke"
                />
                <path
                  class="flipper"
                  d={flipperPath(f().pivot, contactBaseRadius(), contactTipRadius(), centerDistance(), f().angle)}
                  vector-effect="non-scaling-stroke"
                />
                <path
                  class="flipper-insert"
                  d={flipperPath(f().pivot, flippers.baseRadius, flippers.tipRadius, centerDistance(), f().angle)}
                  vector-effect="non-scaling-stroke"
                />
                <circle
                  class="flipper-pivot"
                  cx={f().pivot.x}
                  cy={f().pivot.y}
                  r={PIVOT_RADIUS}
                  vector-effect="non-scaling-stroke"
                />
              </g>
            )}
          </Index>
        </g>
        <Show when={visible.safeTravel}>
          <SafeTravel />
        </Show>
        <Show when={visible.reserved}>
          <ReservedAreas />
        </Show>
        <Annotations flippers={layout().flippers} />
        <Show when={visible.walls}>
          <ShotLanes />
        </Show>
        <Show when={visible.paths}>
          <ShotPaths />
        </Show>
        <Show when={visible.walls}>
          <WallMounts />
        </Show>
        <ShotMarkers />
        <Show when={visible.reserved}>
          <ReservedMarkers />
        </Show>
      </svg>
      <h1 class="preview-title">Tangentry</h1>
      <div class="preview-zoom" role="group" aria-label="Zoom">
        <button type="button" class="preview-zoom-button" aria-label="Zoom out" title="Zoom out" onClick={zoomOut}>
          −
        </button>
        <button
          type="button"
          class="preview-zoom-button preview-zoom-level"
          title="Fit the playfield"
          onClick={resetView}
        >
          {Math.round(zoom() * 100)}%
        </button>
        <button type="button" class="preview-zoom-button" aria-label="Zoom in" title="Zoom in" onClick={zoomIn}>
          +
        </button>
      </div>
      <div class="view-controls">
        <PathColoringControl />
        <LayersControl />
      </div>
      <ProjectDialog />
    </div>
  )
}
