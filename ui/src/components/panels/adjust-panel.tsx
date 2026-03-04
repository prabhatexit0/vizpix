import { useCallback, useRef, useState } from 'react'
import { useEditorStore } from '@/store'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { SlidersHorizontal } from 'lucide-react'
import { findLayerById } from '@/lib/layer-utils'

interface AdjustValues {
  brightness: number
  contrast: number
  saturation: number
  blur: number
  sharpen: number
  posterize: number
}

const DEFAULTS: AdjustValues = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  blur: 0,
  sharpen: 0,
  posterize: 0,
}

interface SliderDef {
  key: keyof AdjustValues
  label: string
  min: number
  max: number
  step: number
  format?: (v: number) => string
}

const SECTIONS: { label: string; sliders: SliderDef[] }[] = [
  {
    label: 'Adjustments',
    sliders: [
      { key: 'brightness', label: 'Brightness', min: -100, max: 100, step: 1 },
      { key: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1 },
      { key: 'saturation', label: 'Saturation', min: -100, max: 100, step: 1 },
    ],
  },
  {
    label: 'Effects',
    sliders: [
      { key: 'blur', label: 'Blur', min: 0, max: 50, step: 1 },
      {
        key: 'sharpen',
        label: 'Sharpen',
        min: 0,
        max: 3,
        step: 0.1,
        format: (v) => v.toFixed(1),
      },
      {
        key: 'posterize',
        label: 'Posterize',
        min: 0,
        max: 32,
        step: 1,
        format: (v) => (v === 0 ? 'Off' : `${v} colors`),
      },
    ],
  },
]

export function AdjustPanel() {
  const activeLayerId = useEditorStore((s) => s.activeLayerId)
  const layer = useEditorStore((s) => {
    if (!s.activeLayerId) return undefined
    const found = findLayerById(s.layers, s.activeLayerId)
    return found?.type === 'image' ? found : undefined
  })
  const applyWasmToLayer = useEditorStore((s) => s.applyWasmToLayer)
  const processing = useEditorStore((s) => s.processing)
  const setProcessing = useEditorStore((s) => s.setProcessing)

  const [values, setValues] = useState<AdjustValues>(DEFAULTS)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const baseRef = useRef<Uint8Array | null>(null)

  const getBase = useCallback(() => {
    if (!baseRef.current && layer) {
      baseRef.current = layer.imageBytes
    }
    return baseRef.current
  }, [layer])

  const applyAdjust = useCallback(
    async (adj: AdjustValues) => {
      const base = getBase()
      if (!base || !activeLayerId) return

      const hasColorAdj = adj.brightness !== 0 || adj.contrast !== 0 || adj.saturation !== 0
      const hasBlur = adj.blur > 0
      const hasSharpen = adj.sharpen > 0
      const hasPosterize = adj.posterize >= 2
      if (!hasColorAdj && !hasBlur && !hasSharpen && !hasPosterize) return

      setProcessing(true)
      try {
        let result = base

        if (hasColorAdj) {
          const { adjust_image } = await import('@/wasm/vizpix-core/vizpix_core')
          result = adjust_image(result, adj.brightness, adj.contrast, adj.saturation)
        }

        if (hasBlur) {
          const { apply_blur } = await import('@/wasm/vizpix-core/vizpix_core')
          result = apply_blur(result, adj.blur, 'gaussian')
        }

        if (hasSharpen) {
          const { apply_sharpen } = await import('@/wasm/vizpix-core/vizpix_core')
          result = apply_sharpen(result, adj.sharpen, 5, 0)
        }

        if (hasPosterize) {
          const { quantize_colors } = await import('@/wasm/vizpix-core/vizpix_core')
          result = quantize_colors(result, adj.posterize)
        }

        await applyWasmToLayer(activeLayerId, result)
      } finally {
        setProcessing(false)
      }
    },
    [activeLayerId, applyWasmToLayer, getBase, setProcessing],
  )

  const handleChange = useCallback(
    (key: keyof AdjustValues, val: number) => {
      const next = { ...values, [key]: val }
      setValues(next)
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => applyAdjust(next), 300)
    },
    [values, applyAdjust],
  )

  const handleReset = useCallback(async () => {
    const base = baseRef.current
    if (base && activeLayerId) {
      await applyWasmToLayer(activeLayerId, base)
    }
    setValues(DEFAULTS)
    baseRef.current = null
  }, [activeLayerId, applyWasmToLayer])

  if (!layer) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8 text-neutral-500">
        <SlidersHorizontal size={24} strokeWidth={1.5} />
        <span className="text-xs">Select a layer to adjust</span>
      </div>
    )
  }

  const isDefault = (Object.keys(DEFAULTS) as (keyof AdjustValues)[]).every(
    (k) => values[k] === DEFAULTS[k],
  )

  return (
    <div className="relative flex flex-col gap-4 p-3">
      {processing && (
        <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden">
          <div className="h-full w-1/3 animate-[shimmer_1s_ease-in-out_infinite] bg-blue-500/70" />
        </div>
      )}

      {SECTIONS.map((section, i) => (
        <div key={section.label} className="flex flex-col gap-4">
          {i > 0 && <div className="h-px bg-white/15" />}
          <p className="text-[11px] font-medium tracking-wider text-neutral-500 uppercase">
            {section.label}
          </p>
          {section.sliders.map(({ key, label, min, max, step, format }) => (
            <div key={key}>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs tracking-wide text-neutral-500 uppercase">{label}</label>
                <span className="text-xs text-neutral-400 tabular-nums">
                  {format ? format(values[key]) : values[key]}
                </span>
              </div>
              <Slider
                value={[values[key]]}
                min={min}
                max={max}
                step={step}
                onValueChange={([v]) => handleChange(key, v)}
              />
            </div>
          ))}
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        onClick={handleReset}
        disabled={processing || isDefault}
        className="text-xs"
      >
        Reset
      </Button>
    </div>
  )
}
