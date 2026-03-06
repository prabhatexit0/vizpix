import { useEffect, useState, useCallback, useRef } from 'react'
import { useEditorStore } from '@/store'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { BLEND_MODES } from '@/lib/constants'
import type { BlendMode, Fill, FontWeight } from '@/store/types'
import { Layers, Loader2, ImagePlus, RotateCcw, X } from 'lucide-react'
import { computeHistogram, type HistogramData } from '@/lib/histogram-utils'
import { HistogramDisplay } from './histogram-display'
import { findLayerById, getLayerDimensions } from '@/lib/layer-utils'

const COMMON_FONTS = [
  'Inter',
  'Arial',
  'Helvetica',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Trebuchet MS',
  'Impact',
  'Comic Sans MS',
  'monospace',
  'serif',
  'sans-serif',
]

export function PropertiesPanel() {
  const activeLayerId = useEditorStore((s) => s.activeLayerId)
  const editingTextLayerId = useEditorStore((s) => s.editingTextLayerId)
  const layer = useEditorStore((s) => findLayerById(s.layers, s.activeLayerId ?? ''))
  const setTransform = useEditorStore((s) => s.setTransform)
  const setOpacity = useEditorStore((s) => s.setOpacity)
  const setBlendMode = useEditorStore((s) => s.setBlendMode)
  const updateShapeProperties = useEditorStore((s) => s.updateShapeProperties)
  const updateTextProperties = useEditorStore((s) => s.updateTextProperties)
  const setLayerMask = useEditorStore((s) => s.setLayerMask)
  const removeLayerMask = useEditorStore((s) => s.removeLayerMask)
  const invertLayerMask = useEditorStore((s) => s.invertLayerMask)
  const pushSnapshot = useEditorStore((s) => s.pushSnapshot)

  const sliderDragRef = useRef(false)

  const onInputFocus = useCallback(() => {
    pushSnapshot()
  }, [pushSnapshot])

  const onSliderChange = useCallback(
    ([v]: number[]) => {
      if (!sliderDragRef.current) {
        pushSnapshot()
        sliderDragRef.current = true
      }
      setOpacity(activeLayerId!, Math.max(0, Math.min(100, v)) / 100)
    },
    [pushSnapshot, setOpacity, activeLayerId],
  )

  const onSliderCommit = useCallback(() => {
    sliderDragRef.current = false
  }, [])

  const clampedUpdate = useCallback(
    (
      fn: (id: string, val: Record<string, unknown>) => void,
      id: string,
      key: string,
      raw: string,
      min?: number,
      max?: number,
    ) => {
      const n = Number(raw)
      if (Number.isNaN(n)) return
      const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n))
      fn(id, { [key]: clamped })
    },
    [],
  )

  const [histogram, setHistogram] = useState<HistogramData | null>(null)
  const [histBytesRef, setHistBytesRef] = useState<Uint8Array | null>(null)

  const imageBytes = layer?.type === 'image' ? layer.imageBytes : null
  const histLoading = imageBytes != null && histBytesRef !== imageBytes

  useEffect(() => {
    if (!imageBytes) return
    let cancelled = false
    computeHistogram(imageBytes).then((data) => {
      if (!cancelled) {
        setHistogram(data)
        setHistBytesRef(imageBytes)
      }
    })
    return () => {
      cancelled = true
    }
  }, [imageBytes])

  const handleAddMask = useCallback(() => {
    if (!activeLayerId) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const bytes = new Uint8Array(await file.arrayBuffer())
      setLayerMask(activeLayerId, bytes)
    }
    input.click()
  }, [activeLayerId, setLayerMask])

  if (!layer || !activeLayerId) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8 text-neutral-500">
        <Layers size={24} strokeWidth={1.5} />
        <span className="text-xs">Select a layer to view properties</span>
      </div>
    )
  }

  const { transform } = layer
  const dims = getLayerDimensions(layer)

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Position */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">X</label>
          <Input
            type="number"
            value={Math.round(transform.x)}
            onFocus={onInputFocus}
            onChange={(e) => setTransform(activeLayerId, { x: Number(e.target.value) })}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">Y</label>
          <Input
            type="number"
            value={Math.round(transform.y)}
            onFocus={onInputFocus}
            onChange={(e) => setTransform(activeLayerId, { y: Number(e.target.value) })}
            className="h-8 text-xs"
          />
        </div>
      </div>

      {/* Scale */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">
            Scale X
          </label>
          <Input
            type="number"
            step={0.01}
            min={0.01}
            value={transform.scaleX.toFixed(2)}
            onFocus={onInputFocus}
            onChange={(e) =>
              clampedUpdate(setTransform, activeLayerId, 'scaleX', e.target.value, 0.01)
            }
            onBlur={(e) => {
              const n = Number(e.target.value)
              if (Number.isNaN(n) || n < 0.01) setTransform(activeLayerId, { scaleX: 0.01 })
            }}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">
            Scale Y
          </label>
          <Input
            type="number"
            step={0.01}
            min={0.01}
            value={transform.scaleY.toFixed(2)}
            onFocus={onInputFocus}
            onChange={(e) =>
              clampedUpdate(setTransform, activeLayerId, 'scaleY', e.target.value, 0.01)
            }
            onBlur={(e) => {
              const n = Number(e.target.value)
              if (Number.isNaN(n) || n < 0.01) setTransform(activeLayerId, { scaleY: 0.01 })
            }}
            className="h-8 text-xs"
          />
        </div>
      </div>

      {/* Rotation */}
      <div>
        <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">
          Rotation
        </label>
        <Input
          type="number"
          value={Math.round(((transform.rotation % 360) + 360) % 360)}
          onFocus={onInputFocus}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (!Number.isNaN(n)) setTransform(activeLayerId, { rotation: n })
          }}
          className="h-8 text-xs"
        />
      </div>

      {/* Opacity */}
      <div>
        <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">
          Opacity — {Math.round(layer.opacity * 100)}%
        </label>
        <Slider
          value={[layer.opacity * 100]}
          min={0}
          max={100}
          step={1}
          onValueChange={onSliderChange}
          onValueCommit={onSliderCommit}
        />
      </div>

      {/* Blend Mode */}
      <div>
        <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">
          Blend Mode
        </label>
        <Select
          value={layer.blendMode}
          onValueChange={(v) => setBlendMode(activeLayerId, v as BlendMode)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BLEND_MODES.map((bm) => (
              <SelectItem key={bm.value} value={bm.value}>
                {bm.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Dimensions */}
      <div className="rounded-md bg-white/5 px-3 py-1.5 text-xs text-neutral-400">
        {dims.width} × {dims.height} px
      </div>

      {/* Shape-specific properties */}
      {layer.type === 'shape' && (
        <>
          <div className="h-px bg-white/15" />
          <p className="text-[11px] font-medium tracking-wider text-neutral-500 uppercase">Shape</p>

          {/* Size */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">
                W
              </label>
              <Input
                type="number"
                min={1}
                value={layer.width}
                onFocus={onInputFocus}
                onChange={(e) =>
                  clampedUpdate(updateShapeProperties, activeLayerId, 'width', e.target.value, 1)
                }
                onBlur={(e) => {
                  const n = Number(e.target.value)
                  if (Number.isNaN(n) || n < 1) updateShapeProperties(activeLayerId, { width: 1 })
                }}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">
                H
              </label>
              <Input
                type="number"
                min={1}
                value={layer.height}
                onFocus={onInputFocus}
                onChange={(e) =>
                  clampedUpdate(updateShapeProperties, activeLayerId, 'height', e.target.value, 1)
                }
                onBlur={(e) => {
                  const n = Number(e.target.value)
                  if (Number.isNaN(n) || n < 1) updateShapeProperties(activeLayerId, { height: 1 })
                }}
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* Fill color (solid only for simplicity) */}
          {layer.fill.type === 'solid' && (
            <div>
              <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">
                Fill
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={layer.fill.color}
                  onChange={(e) =>
                    updateShapeProperties(activeLayerId, {
                      fill: { type: 'solid', color: e.target.value },
                    })
                  }
                  className="h-8 w-8 cursor-pointer rounded border border-white/12 bg-transparent"
                />
                <Input
                  value={layer.fill.color}
                  onChange={(e) =>
                    updateShapeProperties(activeLayerId, {
                      fill: { type: 'solid', color: e.target.value },
                    })
                  }
                  className="h-8 flex-1 text-xs"
                />
              </div>
            </div>
          )}

          {/* Fill type selector */}
          <div>
            <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">
              Fill Type
            </label>
            <Select
              value={layer.fill.type}
              onValueChange={(v) => {
                const currentFill = layer.fill
                const baseColor =
                  currentFill.type === 'solid'
                    ? currentFill.color
                    : currentFill.type === 'linear-gradient' ||
                        currentFill.type === 'radial-gradient'
                      ? (currentFill.gradient.stops[0]?.color ?? '#3b82f6')
                      : '#3b82f6'

                const fillMap: Record<string, () => Fill> = {
                  none: () => ({ type: 'none' as const }),
                  solid: () => ({ type: 'solid' as const, color: baseColor }),
                  'linear-gradient': () => ({
                    type: 'linear-gradient' as const,
                    gradient: {
                      stops: [
                        { offset: 0, color: baseColor },
                        { offset: 1, color: '#0000ff' },
                      ],
                      angle: 90,
                    },
                  }),
                  'radial-gradient': () => ({
                    type: 'radial-gradient' as const,
                    gradient: {
                      stops: [
                        { offset: 0, color: baseColor },
                        { offset: 1, color: '#000000' },
                      ],
                      angle: 0,
                    },
                  }),
                }
                const factory = fillMap[v]
                if (factory) updateShapeProperties(activeLayerId, { fill: factory() as Fill })
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="solid">Solid</SelectItem>
                <SelectItem value="linear-gradient">Linear Gradient</SelectItem>
                <SelectItem value="radial-gradient">Radial Gradient</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Stroke */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">
                Stroke W
              </label>
              <Input
                type="number"
                value={layer.stroke.width}
                min={0}
                onFocus={onInputFocus}
                onChange={(e) =>
                  updateShapeProperties(activeLayerId, {
                    stroke: { ...layer.stroke, width: Number(e.target.value) },
                  })
                }
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">
                Color
              </label>
              <input
                type="color"
                value={layer.stroke.color}
                onChange={(e) =>
                  updateShapeProperties(activeLayerId, {
                    stroke: { ...layer.stroke, color: e.target.value },
                  })
                }
                className="h-8 w-full cursor-pointer rounded border border-white/12 bg-transparent"
              />
            </div>
          </div>

          {/* Corner radius (rectangle only) */}
          {layer.shapeType === 'rectangle' && (
            <div>
              <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">
                Corner Radius
              </label>
              <Input
                type="number"
                value={layer.cornerRadius}
                min={0}
                onFocus={onInputFocus}
                onChange={(e) =>
                  updateShapeProperties(activeLayerId, { cornerRadius: Number(e.target.value) })
                }
                className="h-8 text-xs"
              />
            </div>
          )}
        </>
      )}

      {/* Text-specific properties */}
      {layer.type === 'text' && (
        <>
          <div className="h-px bg-white/15" />
          <p className="text-[11px] font-medium tracking-wider text-neutral-500 uppercase">Text</p>

          <div>
            <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">
              Content
            </label>
            {editingTextLayerId === activeLayerId ? (
              <div className="w-full rounded-md border border-white/12 bg-white/5 px-2 py-1.5 text-xs text-neutral-400 italic">
                Editing on canvas...
              </div>
            ) : (
              <textarea
                value={layer.content}
                onFocus={onInputFocus}
                onChange={(e) => updateTextProperties(activeLayerId, { content: e.target.value })}
                className="w-full rounded-md border border-white/12 bg-white/5 px-2 py-1.5 text-xs text-neutral-200 outline-none focus:ring-1 focus:ring-blue-500/50"
                rows={3}
              />
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">
              Font
            </label>
            <Select
              value={COMMON_FONTS.includes(layer.fontFamily) ? layer.fontFamily : '__custom__'}
              onValueChange={(v) => {
                if (v !== '__custom__') {
                  updateTextProperties(activeLayerId, { fontFamily: v })
                }
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMON_FONTS.map((font) => (
                  <SelectItem key={font} value={font}>
                    <span style={{ fontFamily: font }}>{font}</span>
                  </SelectItem>
                ))}
                <SelectItem value="__custom__">Custom...</SelectItem>
              </SelectContent>
            </Select>
            {!COMMON_FONTS.includes(layer.fontFamily) && (
              <Input
                className="mt-1 h-7 text-xs"
                placeholder="Custom font name"
                defaultValue={layer.fontFamily}
                onFocus={onInputFocus}
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v) updateTextProperties(activeLayerId, { fontFamily: v })
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                }}
              />
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">
              Size
            </label>
            <Input
              type="number"
              value={layer.fontSize}
              min={1}
              onFocus={onInputFocus}
              onChange={(e) =>
                updateTextProperties(activeLayerId, { fontSize: Number(e.target.value) })
              }
              className="h-8 text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">
                Weight
              </label>
              <Select
                value={String(layer.fontWeight)}
                onValueChange={(v) =>
                  updateTextProperties(activeLayerId, { fontWeight: Number(v) as FontWeight })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => (
                    <SelectItem key={w} value={String(w)}>
                      {w}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">
                Style
              </label>
              <Select
                value={layer.fontStyle}
                onValueChange={(v) =>
                  updateTextProperties(activeLayerId, { fontStyle: v as 'normal' | 'italic' })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="italic">Italic</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Text fill type */}
          <div>
            <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">
              Fill Type
            </label>
            <Select
              value={layer.fill.type}
              onValueChange={(v) => {
                const currentFill = layer.fill
                const baseColor =
                  currentFill.type === 'solid'
                    ? currentFill.color
                    : currentFill.type === 'linear-gradient' ||
                        currentFill.type === 'radial-gradient'
                      ? (currentFill.gradient.stops[0]?.color ?? '#ffffff')
                      : '#ffffff'

                const fillMap: Record<string, () => Fill> = {
                  none: () => ({ type: 'none' as const }),
                  solid: () => ({ type: 'solid' as const, color: baseColor }),
                  'linear-gradient': () => ({
                    type: 'linear-gradient' as const,
                    gradient: {
                      stops: [
                        { offset: 0, color: baseColor },
                        { offset: 1, color: '#0000ff' },
                      ],
                      angle: 90,
                    },
                  }),
                  'radial-gradient': () => ({
                    type: 'radial-gradient' as const,
                    gradient: {
                      stops: [
                        { offset: 0, color: baseColor },
                        { offset: 1, color: '#000000' },
                      ],
                      angle: 0,
                    },
                  }),
                }
                const factory = fillMap[v]
                if (factory) updateTextProperties(activeLayerId, { fill: factory() as Fill })
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="solid">Solid</SelectItem>
                <SelectItem value="linear-gradient">Linear Gradient</SelectItem>
                <SelectItem value="radial-gradient">Radial Gradient</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Text fill color */}
          {layer.fill.type === 'solid' && (
            <div>
              <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">
                Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={layer.fill.color}
                  onChange={(e) =>
                    updateTextProperties(activeLayerId, {
                      fill: { type: 'solid', color: e.target.value },
                    })
                  }
                  className="h-8 w-8 cursor-pointer rounded border border-white/12 bg-transparent"
                />
                <Input
                  value={layer.fill.color}
                  onChange={(e) =>
                    updateTextProperties(activeLayerId, {
                      fill: { type: 'solid', color: e.target.value },
                    })
                  }
                  className="h-8 flex-1 text-xs"
                />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">
              Align
            </label>
            <Select
              value={layer.textAlign}
              onValueChange={(v) =>
                updateTextProperties(activeLayerId, { textAlign: v as 'left' | 'center' | 'right' })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">
                Line H
              </label>
              <Input
                type="number"
                step={0.1}
                value={layer.lineHeight}
                onFocus={onInputFocus}
                onChange={(e) =>
                  updateTextProperties(activeLayerId, { lineHeight: Number(e.target.value) })
                }
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">
                Spacing
              </label>
              <Input
                type="number"
                value={layer.letterSpacing}
                onFocus={onInputFocus}
                onChange={(e) =>
                  updateTextProperties(activeLayerId, { letterSpacing: Number(e.target.value) })
                }
                className="h-8 text-xs"
              />
            </div>
          </div>
        </>
      )}

      {/* Mask section */}
      <div className="h-px bg-white/15" />
      <div>
        <label className="mb-1.5 block text-xs tracking-wider text-neutral-500 uppercase">
          Mask
        </label>
        {layer.mask ? (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-xs text-neutral-400">
              {layer.mask.width}×{layer.mask.height} {layer.mask.inverted ? '(inverted)' : ''}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => invertLayerMask(activeLayerId)}
            >
              <RotateCcw size={12} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => removeLayerMask(activeLayerId)}
            >
              <X size={12} />
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="w-full text-xs" onClick={handleAddMask}>
            <ImagePlus size={12} className="mr-1" />
            Add Mask
          </Button>
        )}
      </div>

      {/* Histogram (image layers only) */}
      {layer.type === 'image' && (
        <>
          <div className="h-px bg-white/15" />
          <div>
            <label className="mb-1.5 block text-xs tracking-wide text-neutral-500 uppercase">
              Histogram
            </label>
            {histLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={16} className="animate-spin text-neutral-500" />
              </div>
            ) : histogram ? (
              <HistogramDisplay data={histogram} />
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
