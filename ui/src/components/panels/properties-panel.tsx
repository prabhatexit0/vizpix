import { useEffect, useState, useCallback, useMemo } from 'react'
import { useEditorStore } from '@/store'
import { Input } from '@/components/ui/input'
import { ScrubInput } from '@/components/ui/scrub-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SliderInput } from '@/components/ui/slider-input'
import { ColorPicker } from '@/components/ui/color-picker'
import { RotationDial } from '@/components/ui/rotation-dial'
import { Button } from '@/components/ui/button'
import { BLEND_MODES } from '@/lib/constants'
import type { BlendMode, Fill, FontWeight, TextRun } from '@/store/types'
import { Layers, Loader2, ImagePlus, Link, Unlink, RotateCcw, X } from 'lucide-react'
import { useResponsive } from '@/hooks/use-responsive'
import { computeHistogram, type HistogramData } from '@/lib/histogram-utils'
import { HistogramDisplay } from './histogram-display'
import { findLayerById, getLayerDimensions } from '@/lib/layer-utils'
import { getFormattingAtSelection, type SelectionFormatting } from '@/lib/rich-text-utils'

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
  const { isDesktop } = useResponsive()
  const activeLayerId = useEditorStore((s) => s.activeLayerId)
  const editingTextLayerId = useEditorStore((s) => s.editingTextLayerId)
  const textSelection = useEditorStore((s) => s.textSelection)
  const layer = useEditorStore((s) => findLayerById(s.layers, s.activeLayerId ?? ''))
  const documentWidth = useEditorStore((s) => s.documentWidth)
  const documentHeight = useEditorStore((s) => s.documentHeight)
  const setTransform = useEditorStore((s) => s.setTransform)
  const setOpacity = useEditorStore((s) => s.setOpacity)
  const setBlendMode = useEditorStore((s) => s.setBlendMode)
  const updateShapeProperties = useEditorStore((s) => s.updateShapeProperties)
  const updateTextProperties = useEditorStore((s) => s.updateTextProperties)
  const applyTextFormatting = useEditorStore((s) => s.applyTextFormatting)
  const setLayerMask = useEditorStore((s) => s.setLayerMask)
  const removeLayerMask = useEditorStore((s) => s.removeLayerMask)
  const invertLayerMask = useEditorStore((s) => s.invertLayerMask)
  const pushSnapshot = useEditorStore((s) => s.pushSnapshot)

  const [constrainProportions, setConstrainProportions] = useState(false)

  const isEditingText = layer?.type === 'text' && editingTextLayerId === activeLayerId
  const hasRangeSelection =
    isEditingText && textSelection !== null && textSelection.start !== textSelection.end

  const selectionFormatting = useMemo((): SelectionFormatting | null => {
    if (!hasRangeSelection || !layer || layer.type !== 'text' || !textSelection) return null
    return getFormattingAtSelection(layer.runs, textSelection.start, textSelection.end)
  }, [hasRangeSelection, layer, textSelection])

  const updateTextProp = useCallback(
    (
      props: Partial<
        Pick<
          TextRun,
          'fontFamily' | 'fontSize' | 'fontWeight' | 'fontStyle' | 'fill' | 'letterSpacing'
        >
      >,
    ) => {
      if (!activeLayerId) return
      if (hasRangeSelection) {
        pushSnapshot()
        applyTextFormatting(activeLayerId, props)
      } else {
        updateTextProperties(activeLayerId, props as Record<string, unknown>)
      }
    },
    [activeLayerId, hasRangeSelection, pushSnapshot, applyTextFormatting, updateTextProperties],
  )

  const onInputFocus = useCallback(() => {
    pushSnapshot()
  }, [pushSnapshot])

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
  // Display document-relative coordinates (0,0 = top-left of document)
  const displayX = Math.round(transform.x + documentWidth / 2)
  const displayY = Math.round(transform.y + documentHeight / 2)

  return (
    <div
      className={`flex flex-col overflow-y-auto p-3 ${!isDesktop ? 'gap-4' : 'gap-3'}`}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          ;(document.activeElement as HTMLElement)?.blur?.()
        }
      }}
    >
      {/* Position */}
      <div className={`grid grid-cols-2 ${!isDesktop ? 'gap-3' : 'gap-2'}`}>
        <ScrubInput
          label="X"
          value={displayX}
          step={1}
          onChange={(v) => setTransform(activeLayerId, { x: v - documentWidth / 2 })}
          onCommit={() => pushSnapshot()}
        />
        <ScrubInput
          label="Y"
          value={displayY}
          step={1}
          onChange={(v) => setTransform(activeLayerId, { y: v - documentHeight / 2 })}
          onCommit={() => pushSnapshot()}
        />
      </div>

      {/* Scale */}
      <div className={`grid grid-cols-2 ${!isDesktop ? 'gap-3' : 'gap-2'}`}>
        <ScrubInput
          label="Scale X"
          value={transform.scaleX}
          step={0.01}
          min={0.01}
          precision={2}
          onChange={(v) => setTransform(activeLayerId, { scaleX: v })}
          onCommit={() => pushSnapshot()}
        />
        <ScrubInput
          label="Scale Y"
          value={transform.scaleY}
          step={0.01}
          min={0.01}
          precision={2}
          onChange={(v) => setTransform(activeLayerId, { scaleY: v })}
          onCommit={() => pushSnapshot()}
        />
      </div>

      {/* Rotation */}
      <div className={`flex items-center ${!isDesktop ? 'gap-3' : 'gap-2'}`}>
        <ScrubInput
          label="Rotation"
          value={Math.round(((transform.rotation % 360) + 360) % 360)}
          step={1}
          suffix="°"
          onChange={(v) => setTransform(activeLayerId, { rotation: v })}
          onCommit={() => pushSnapshot()}
        />
        <RotationDial
          value={Math.round(((transform.rotation % 360) + 360) % 360)}
          onChange={(v) => setTransform(activeLayerId, { rotation: v })}
          onCommit={() => pushSnapshot()}
        />
      </div>

      {/* Opacity */}
      <SliderInput
        label="Opacity"
        value={Math.round(layer.opacity * 100)}
        min={0}
        max={100}
        step={1}
        suffix="%"
        onValueChange={(v) => setOpacity(activeLayerId, Math.max(0, Math.min(100, v)) / 100)}
        onValueCommit={() => pushSnapshot()}
      />

      {/* Blend Mode */}
      <div>
        <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">
          Blend Mode
        </label>
        <Select
          value={layer.blendMode}
          onValueChange={(v) => setBlendMode(activeLayerId, v as BlendMode)}
        >
          <SelectTrigger className={`${!isDesktop ? 'h-11' : 'h-8'} text-xs`}>
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
        {Math.round(dims.width)} × {Math.round(dims.height)} px
      </div>

      {/* Shape-specific properties */}
      {layer.type === 'shape' && (
        <>
          <div className="h-px bg-white/15" />
          <p className="text-[11px] font-medium tracking-wider text-neutral-500 uppercase">Shape</p>

          {/* Size */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <ScrubInput
                label="W"
                value={Math.round(layer.width * transform.scaleX)}
                step={1}
                min={1}
                suffix="px"
                onChange={(v) => {
                  const ratio = layer.height / layer.width
                  updateShapeProperties(activeLayerId, {
                    width: v / transform.scaleX,
                    ...(constrainProportions ? { height: (v / transform.scaleX) * ratio } : {}),
                  })
                }}
                onCommit={() => pushSnapshot()}
              />
            </div>
            <button
              className={`mb-0.5 shrink-0 rounded p-1 ${constrainProportions ? 'text-blue-400' : 'text-neutral-500'}`}
              onClick={() => setConstrainProportions((p) => !p)}
            >
              {constrainProportions ? <Link size={14} /> : <Unlink size={14} />}
            </button>
            <div className="flex-1">
              <ScrubInput
                label="H"
                value={Math.round(layer.height * transform.scaleY)}
                step={1}
                min={1}
                suffix="px"
                onChange={(v) => {
                  const ratio = layer.width / layer.height
                  updateShapeProperties(activeLayerId, {
                    height: v / transform.scaleY,
                    ...(constrainProportions ? { width: (v / transform.scaleY) * ratio } : {}),
                  })
                }}
                onCommit={() => pushSnapshot()}
              />
            </div>
          </div>

          {/* Fill color (solid only for simplicity) */}
          {layer.fill.type === 'solid' && (
            <div>
              <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">
                Fill
              </label>
              <div className={`flex items-center ${!isDesktop ? 'gap-3' : 'gap-2'}`}>
                <ColorPicker
                  value={layer.fill.color}
                  onChange={(c) =>
                    updateShapeProperties(activeLayerId, {
                      fill: { type: 'solid', color: c },
                    })
                  }
                />
                <span className="text-xs text-neutral-400">{layer.fill.color}</span>
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
              <SelectTrigger className={`${!isDesktop ? 'h-11' : 'h-8'} text-xs`}>
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
          <SliderInput
            label="Stroke W"
            value={layer.stroke.width}
            min={0}
            max={50}
            step={0.5}
            suffix="px"
            precision={1}
            onValueChange={(v) =>
              updateShapeProperties(activeLayerId, {
                stroke: { ...layer.stroke, width: v },
              })
            }
            onValueCommit={() => pushSnapshot()}
          />
          <div>
            <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">
              Stroke Color
            </label>
            <div className={`flex items-center ${!isDesktop ? 'gap-3' : 'gap-2'}`}>
              <ColorPicker
                value={layer.stroke.color}
                onChange={(c) =>
                  updateShapeProperties(activeLayerId, {
                    stroke: { ...layer.stroke, color: c },
                  })
                }
              />
              <span className="text-xs text-neutral-400">{layer.stroke.color}</span>
            </div>
          </div>

          {/* Corner radius (rectangle only) */}
          {layer.shapeType === 'rectangle' && (
            <SliderInput
              label="Radius"
              value={layer.cornerRadius}
              min={0}
              max={Math.floor(Math.min(layer.width, layer.height) / 2)}
              step={1}
              suffix="px"
              onValueChange={(v) => updateShapeProperties(activeLayerId, { cornerRadius: v })}
              onValueCommit={() => pushSnapshot()}
            />
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
              {selectionFormatting?.mixed && selectionFormatting.fontFamily === undefined
                ? ' (Mixed)'
                : ''}
            </label>
            <Select
              value={(() => {
                const ff = selectionFormatting?.fontFamily ?? layer.fontFamily
                return COMMON_FONTS.includes(ff) ? ff : '__custom__'
              })()}
              onValueChange={(v) => {
                if (v !== '__custom__') {
                  updateTextProp({ fontFamily: v })
                }
              }}
            >
              <SelectTrigger className={`${!isDesktop ? 'h-11' : 'h-8'} text-xs`}>
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
            {!COMMON_FONTS.includes(selectionFormatting?.fontFamily ?? layer.fontFamily) && (
              <Input
                className="mt-1 h-7 text-xs"
                placeholder="Custom font name"
                defaultValue={selectionFormatting?.fontFamily ?? layer.fontFamily}
                onFocus={onInputFocus}
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v) updateTextProp({ fontFamily: v })
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                }}
              />
            )}
          </div>

          <ScrubInput
            label={`Size${selectionFormatting?.mixed && selectionFormatting.fontSize === undefined ? ' (Mixed)' : ''}`}
            value={selectionFormatting?.fontSize ?? layer.fontSize}
            step={1}
            min={1}
            suffix="px"
            onChange={(v) => updateTextProp({ fontSize: v })}
            onCommit={() => pushSnapshot()}
          />

          <div className={`grid grid-cols-2 ${!isDesktop ? 'gap-3' : 'gap-2'}`}>
            <div>
              <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">
                Weight
                {selectionFormatting?.mixed && selectionFormatting.fontWeight === undefined
                  ? ' (Mixed)'
                  : ''}
              </label>
              <Select
                value={String(selectionFormatting?.fontWeight ?? layer.fontWeight)}
                onValueChange={(v) => updateTextProp({ fontWeight: Number(v) as FontWeight })}
              >
                <SelectTrigger className={`${!isDesktop ? 'h-11' : 'h-8'} text-xs`}>
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
                {selectionFormatting?.mixed && selectionFormatting.fontStyle === undefined
                  ? ' (Mixed)'
                  : ''}
              </label>
              <Select
                value={selectionFormatting?.fontStyle ?? layer.fontStyle}
                onValueChange={(v) => updateTextProp({ fontStyle: v as 'normal' | 'italic' })}
              >
                <SelectTrigger className={`${!isDesktop ? 'h-11' : 'h-8'} text-xs`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="italic">Italic</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Text fill type — only for whole-layer (not selection-aware, as fill type is complex) */}
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
              <SelectTrigger className={`${!isDesktop ? 'h-11' : 'h-8'} text-xs`}>
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

          {/* Text fill color — selection-aware for solid colors */}
          {(() => {
            const selFill = selectionFormatting?.fill
            const effectiveFill = hasRangeSelection && selFill ? selFill : layer.fill
            const isMixedColor =
              hasRangeSelection && selectionFormatting?.mixed && selFill === undefined
            if (effectiveFill.type !== 'solid' && !isMixedColor) return null
            const colorValue = effectiveFill.type === 'solid' ? effectiveFill.color : '#ffffff'
            return (
              <div>
                <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">
                  Color{isMixedColor ? ' (Mixed)' : ''}
                </label>
                <div className={`flex items-center ${!isDesktop ? 'gap-3' : 'gap-2'}`}>
                  <ColorPicker
                    value={colorValue}
                    onChange={(c) =>
                      updateTextProp({
                        fill: { type: 'solid', color: c },
                      })
                    }
                  />
                  <span className="text-xs text-neutral-400">{colorValue}</span>
                </div>
              </div>
            )
          })()}

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
              <SelectTrigger className={`${!isDesktop ? 'h-11' : 'h-8'} text-xs`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className={`grid grid-cols-2 ${!isDesktop ? 'gap-3' : 'gap-2'}`}>
            <ScrubInput
              label="Line H"
              value={layer.lineHeight}
              step={0.05}
              min={0.5}
              max={5}
              precision={2}
              onChange={(v) => updateTextProperties(activeLayerId, { lineHeight: v })}
              onCommit={() => pushSnapshot()}
            />
            <ScrubInput
              label="Spacing"
              value={layer.letterSpacing}
              step={0.1}
              min={-10}
              max={50}
              precision={1}
              suffix="px"
              onChange={(v) => updateTextProperties(activeLayerId, { letterSpacing: v })}
              onCommit={() => pushSnapshot()}
            />
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
          <div className={`flex items-center ${!isDesktop ? 'gap-3' : 'gap-2'}`}>
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
