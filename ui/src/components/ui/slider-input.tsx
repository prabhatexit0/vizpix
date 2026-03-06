import { useCallback, useRef } from 'react'
import { Slider } from '@/components/ui/slider'
import { ScrubInput } from '@/components/ui/scrub-input'

interface SliderInputProps {
  label?: string
  value: number
  onValueChange: (value: number) => void
  onValueCommit?: (value: number) => void
  min?: number
  max?: number
  step?: number
  precision?: number
  suffix?: string
}

export function SliderInput({
  label,
  value,
  onValueChange,
  onValueCommit,
  min = 0,
  max = 100,
  step = 1,
  precision = 0,
  suffix,
}: SliderInputProps) {
  const dragStartedRef = useRef(false)

  const handleSliderChange = useCallback(
    ([v]: number[]) => {
      if (!dragStartedRef.current) {
        onValueCommit?.(value)
        dragStartedRef.current = true
      }
      onValueChange(v)
    },
    [onValueChange, onValueCommit, value],
  )

  const handleSliderCommit = useCallback(() => {
    dragStartedRef.current = false
  }, [])

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <ScrubInput
          label={label}
          value={value}
          onChange={onValueChange}
          onCommit={onValueCommit}
          min={min}
          max={max}
          step={step}
          precision={precision}
          suffix={suffix}
        />
      )}
      <div className="flex items-center gap-2">
        <Slider
          value={[value]}
          min={min}
          max={max}
          step={step}
          onValueChange={handleSliderChange}
          onValueCommit={handleSliderCommit}
          className="flex-1"
        />
        {!label && (
          <input
            type="text"
            inputMode="decimal"
            value={value.toFixed(precision)}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (!Number.isNaN(n)) {
                onValueChange(Math.max(min, Math.min(max, n)))
              }
            }}
            onFocus={(e) => e.target.select()}
            onBlur={() => onValueCommit?.(value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-7 w-14 shrink-0 rounded-md border bg-transparent px-2 text-center text-xs text-neutral-200 transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
          />
        )}
      </div>
    </div>
  )
}
