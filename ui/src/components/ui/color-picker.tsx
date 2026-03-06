import { useCallback, useMemo, useRef, useState } from 'react'
import { Popover as PopoverPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'
import { useResponsive } from '@/hooks/use-responsive'

const PRESETS = [
  '#000000',
  '#ffffff',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#6b7280',
]

function hexToHsv(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  const s = max === 0 ? 0 : d / max
  return [h, s, max]
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0,
    g = 0,
    b = 0
  if (h < 60) {
    r = c
    g = x
  } else if (h < 120) {
    r = x
    g = c
  } else if (h < 180) {
    g = c
    b = x
  } else if (h < 240) {
    g = x
    b = c
  } else if (h < 300) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }
  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const { isMobile } = useResponsive()
  const [open, setOpen] = useState(false)
  const [localHsv, setLocalHsv] = useState<[number, number, number] | null>(null)
  const [hexInput, setHexInput] = useState(value)
  const [lastPropValue, setLastPropValue] = useState(value)
  const svRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)

  // Sync from prop using useState (no refs during render)
  if (lastPropValue !== value) {
    setLastPropValue(value)
    setLocalHsv(null)
    setHexInput(value)
  }

  const hsv = useMemo(() => localHsv ?? hexToHsv(value), [localHsv, value])

  const updateFromHsv = useCallback(
    (h: number, s: number, v: number) => {
      setLocalHsv([h, s, v])
      const hex = hsvToHex(h, s, v)
      setHexInput(hex)
      onChange(hex)
    },
    [onChange],
  )

  const applySv = useCallback(
    (clientX: number, clientY: number, currentH: number) => {
      const rect = svRef.current?.getBoundingClientRect()
      if (!rect) return
      const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const v = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height))
      updateFromHsv(currentH, s, v)
    },
    [updateFromHsv],
  )

  const applyHue = useCallback(
    (clientX: number, currentS: number, currentV: number) => {
      const rect = hueRef.current?.getBoundingClientRect()
      if (!rect) return
      const h = Math.max(0, Math.min(360, ((clientX - rect.left) / rect.width) * 360))
      updateFromHsv(h, currentS, currentV)
    },
    [updateFromHsv],
  )

  const hueColor = hsvToHex(hsv[0], 1, 1)

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          className={cn(
            'shrink-0 cursor-pointer rounded border border-white/12',
            isMobile ? 'h-11 w-11' : 'h-8 w-8',
          )}
          style={{ backgroundColor: value }}
        />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className="z-50 w-56 rounded-lg border border-white/12 bg-neutral-900 p-3 shadow-xl"
          sideOffset={4}
          align="start"
        >
          <SvPlane svRef={svRef} hueColor={hueColor} hsv={hsv} applySv={applySv} />
          <HueBar hueRef={hueRef} hsv={hsv} hueColor={hueColor} applyHue={applyHue} />

          {/* Hex input */}
          <input
            className="border-input focus-visible:border-ring mt-2.5 h-7 w-full rounded-md border bg-transparent px-2 text-xs text-neutral-200 outline-none"
            value={hexInput}
            onChange={(e) => {
              setHexInput(e.target.value)
              const v = e.target.value.trim()
              if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                onChange(v)
                setLocalHsv(hexToHsv(v))
              }
            }}
            onBlur={() => setHexInput(value)}
          />

          {/* Preset swatches */}
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {PRESETS.map((color) => (
              <button
                key={color}
                className="h-5 w-5 cursor-pointer rounded border border-white/12"
                style={{ backgroundColor: color }}
                onClick={() => {
                  onChange(color)
                  setLocalHsv(hexToHsv(color))
                  setHexInput(color)
                }}
              />
            ))}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

function SvPlane({
  svRef,
  hueColor,
  hsv,
  applySv,
}: {
  svRef: React.RefObject<HTMLDivElement | null>
  hueColor: string
  hsv: [number, number, number]
  applySv: (clientX: number, clientY: number, currentH: number) => void
}) {
  const hRef = useRef(hsv[0])

  return (
    <div
      ref={svRef}
      className="relative h-36 w-full cursor-crosshair rounded"
      style={{
        background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
      }}
      onPointerDown={(e) => {
        e.preventDefault()
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        hRef.current = hsv[0]
        applySv(e.clientX, e.clientY, hsv[0])
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) applySv(e.clientX, e.clientY, hRef.current)
      }}
    >
      <div
        className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
        style={{
          left: `${hsv[1] * 100}%`,
          top: `${(1 - hsv[2]) * 100}%`,
        }}
      />
    </div>
  )
}

function HueBar({
  hueRef,
  hsv,
  hueColor,
  applyHue,
}: {
  hueRef: React.RefObject<HTMLDivElement | null>
  hsv: [number, number, number]
  hueColor: string
  applyHue: (clientX: number, currentS: number, currentV: number) => void
}) {
  const svSnapRef = useRef<[number, number]>([hsv[1], hsv[2]])

  return (
    <div
      ref={hueRef}
      className="relative mt-2.5 h-3 w-full cursor-pointer rounded-full"
      style={{
        background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
      }}
      onPointerDown={(e) => {
        e.preventDefault()
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        svSnapRef.current = [hsv[1], hsv[2]]
        applyHue(e.clientX, hsv[1], hsv[2])
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) applyHue(e.clientX, svSnapRef.current[0], svSnapRef.current[1])
      }}
    >
      <div
        className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
        style={{
          left: `${(hsv[0] / 360) * 100}%`,
          backgroundColor: hueColor,
        }}
      />
    </div>
  )
}
