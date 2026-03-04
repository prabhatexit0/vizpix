import { useEffect, useState } from 'react'
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
import { BLEND_MODES } from '@/lib/constants'
import type { BlendMode } from '@/store/types'
import { Layers, Loader2 } from 'lucide-react'
import { computeHistogram, type HistogramData } from '@/lib/histogram-utils'
import { HistogramDisplay } from './histogram-display'

export function PropertiesPanel() {
  const activeLayerId = useEditorStore((s) => s.activeLayerId)
  const layer = useEditorStore((s) => s.layers.find((l) => l.id === s.activeLayerId))
  const setTransform = useEditorStore((s) => s.setTransform)
  const setOpacity = useEditorStore((s) => s.setOpacity)
  const setBlendMode = useEditorStore((s) => s.setBlendMode)
  const renameLayer = useEditorStore((s) => s.renameLayer)

  const [histogram, setHistogram] = useState<HistogramData | null>(null)
  const [histBytesRef, setHistBytesRef] = useState<Uint8Array | null>(null)
  const histLoading = layer?.imageBytes != null && histBytesRef !== layer?.imageBytes

  useEffect(() => {
    if (!layer?.imageBytes) return
    let cancelled = false
    const bytes = layer.imageBytes
    computeHistogram(bytes).then((data) => {
      if (!cancelled) {
        setHistogram(data)
        setHistBytesRef(bytes)
      }
    })
    return () => {
      cancelled = true
    }
  }, [layer?.imageBytes])

  if (!layer || !activeLayerId) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8 text-neutral-500">
        <Layers size={24} strokeWidth={1.5} />
        <span className="text-xs">Select a layer to view properties</span>
      </div>
    )
  }

  const { transform } = layer

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Name */}
      <div>
        <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">Name</label>
        <Input
          value={layer.name}
          onChange={(e) => renameLayer(activeLayerId, e.target.value)}
          className="h-8 text-xs"
        />
      </div>

      {/* Position */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">X</label>
          <Input
            type="number"
            value={Math.round(transform.x)}
            onChange={(e) => setTransform(activeLayerId, { x: Number(e.target.value) })}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs tracking-wide text-neutral-500 uppercase">Y</label>
          <Input
            type="number"
            value={Math.round(transform.y)}
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
            value={transform.scaleX.toFixed(2)}
            onChange={(e) => setTransform(activeLayerId, { scaleX: Number(e.target.value) })}
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
            value={transform.scaleY.toFixed(2)}
            onChange={(e) => setTransform(activeLayerId, { scaleY: Number(e.target.value) })}
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
          value={Math.round(transform.rotation)}
          onChange={(e) => setTransform(activeLayerId, { rotation: Number(e.target.value) })}
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
          onValueChange={([v]) => setOpacity(activeLayerId, v / 100)}
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

      {/* Dimensions (read-only) */}
      <div className="rounded-md bg-white/5 px-3 py-1.5 text-xs text-neutral-400">
        {layer.width} × {layer.height} px
      </div>

      {/* Histogram */}
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
    </div>
  )
}
