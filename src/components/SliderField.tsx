import { Slider } from '@ark-ui/solid/slider'

type Props = {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  // Formats the value shown beside the label.
  format?: (value: number) => string
  // Shown under the slider at each end, e.g. what each direction does.
  ends?: [string, string]
  // Fill the track from the middle, for values either side of zero.
  centered?: boolean
}

/** A number tuned by dragging, for settings found by feel rather than typed in. */
export default function SliderField(props: Props) {
  // Keep the thumb on the track when the range shrinks under the value.
  const clamped = () => Math.min(props.max, Math.max(props.min, props.value))
  return (
    <Slider.Root
      class="slider-field"
      value={[clamped()]}
      min={props.min}
      max={props.max}
      step={props.step ?? 0.0625}
      origin={props.centered ? 'center' : 'start'}
      onValueChange={(details) => props.onChange(details.value[0])}
    >
      <div class="slider-field-header">
        <Slider.Label class="slider-field-label">{props.label}</Slider.Label>
        <span class="slider-field-value">{props.format ? props.format(props.value) : props.value}</span>
      </div>
      <Slider.Control class="slider-field-control">
        <Slider.Track class="slider-field-track">
          <Slider.Range class="slider-field-range" />
        </Slider.Track>
        <Slider.Thumb index={0} class="slider-field-thumb">
          <Slider.HiddenInput />
        </Slider.Thumb>
      </Slider.Control>
      {props.ends && (
        <div class="slider-field-ends">
          <span>{props.ends[0]}</span>
          <span>{props.ends[1]}</span>
        </div>
      )}
    </Slider.Root>
  )
}
