import { useState, useRef, useCallback } from 'react'
import {
  Eye,
  EyeOff,
  Trash2,
  Lock,
  Unlock,
  Image,
  Square,
  Circle,
  Minus,
  Pentagon,
  Type,
  Folder,
  ChevronRight,
} from 'lucide-react'
import { useEditorStore } from '@/store'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import { findLayerById } from '@/lib/layer-utils'
import { renderLayerToContext } from '@/lib/layer-render'
import type { Layer } from '@/store/types'

interface LayerItemProps {
  layerId: string
  depth?: number
}

function LayerIcon({ layer }: { layer: Layer }) {
  switch (layer.type) {
    case 'image':
      return <Image size={16} />
    case 'shape':
      switch (layer.shapeType) {
        case 'rectangle':
          return <Square size={16} />
        case 'ellipse':
          return <Circle size={16} />
        case 'line':
          return <Minus size={16} />
        case 'polygon':
          return <Pentagon size={16} />
      }
      return <Square size={16} />
    case 'text':
      return <Type size={16} />
    case 'group':
      return <Folder size={16} />
  }
}

export function LayerItem({ layerId, depth = 0 }: LayerItemProps) {
  const layer = useEditorStore((s) => findLayerById(s.layers, layerId))
  const activeLayerId = useEditorStore((s) => s.activeLayerId)
  const setActiveLayer = useEditorStore((s) => s.setActiveLayer)
  const toggleVisibility = useEditorStore((s) => s.toggleVisibility)
  const removeLayer = useEditorStore((s) => s.removeLayer)
  const toggleLock = useEditorStore((s) => s.toggleLock)
  const setOpacity = useEditorStore((s) => s.setOpacity)
  const renameLayer = useEditorStore((s) => s.renameLayer)

  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const commitRename = useCallback(() => {
    const value = inputRef.current?.value.trim()
    if (value && layer) renameLayer(layer.id, value)
    setEditing(false)
  }, [layer, renameLayer])

  if (!layer) return null

  const isActive = layer.id === activeLayerId
  const isGroup = layer.type === 'group'

  return (
    <>
      <div
        className={cn(
          'group flex cursor-pointer flex-col gap-1 rounded-lg border px-2 py-1.5 transition-all duration-150',
          isActive
            ? 'border-blue-500/60 bg-blue-500/10'
            : 'border-white/6 hover:border-white/12 hover:bg-white/4',
        )}
        style={{ marginLeft: depth * 16 }}
        onClick={() => setActiveLayer(layer.id)}
      >
        <div className="relative flex min-w-0 items-center gap-2">
          {/* Type icon / thumbnail */}
          <div className="h-8 w-8 shrink-0 overflow-hidden rounded border border-white/12 bg-neutral-800">
            {layer.type === 'image' && layer.imageBitmap ? (
              <canvas
                className="h-full w-full object-contain"
                width={32}
                height={32}
                ref={(c) => {
                  if (!c || layer.type !== 'image' || !layer.imageBitmap) return
                  const ctx = c.getContext('2d')
                  if (!ctx) return
                  ctx.clearRect(0, 0, 32, 32)
                  const scale = Math.min(32 / layer.width, 32 / layer.height)
                  const w = layer.width * scale
                  const h = layer.height * scale
                  ctx.drawImage(layer.imageBitmap, (32 - w) / 2, (32 - h) / 2, w, h)
                }}
              />
            ) : layer.type === 'shape' || layer.type === 'text' ? (
              <canvas
                className="h-full w-full object-contain"
                width={32}
                height={32}
                ref={(c) => {
                  if (!c) return
                  const ctx = c.getContext('2d')
                  if (!ctx) return
                  ctx.clearRect(0, 0, 32, 32)
                  ctx.save()
                  ctx.translate(16, 16)
                  ctx.scale(0.12, 0.12)
                  // Render the layer at identity transform for thumbnail
                  const tempLayer = {
                    ...layer,
                    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
                    opacity: 1,
                  }
                  renderLayerToContext(ctx, tempLayer as Layer, 256, 256)
                  ctx.restore()
                }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-neutral-500">
                <LayerIcon layer={layer} />
              </div>
            )}
          </div>

          {/* Expand toggle for groups */}
          {isGroup && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                useEditorStore.setState((s) => ({
                  layers: toggleGroupExpanded(s.layers, layer.id),
                }))
              }}
              className="p-0.5 text-neutral-400 hover:text-white"
            >
              <ChevronRight
                size={12}
                className={cn('transition-transform', layer.expanded && 'rotate-90')}
              />
            </button>
          )}

          {/* Name */}
          {editing ? (
            <input
              ref={inputRef}
              defaultValue={layer.name}
              autoFocus
              onClick={(e) => e.stopPropagation()}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setEditing(false)
              }}
              className="h-5 flex-1 rounded bg-white/10 px-1 text-xs text-neutral-200 outline-none focus:ring-1 focus:ring-blue-500/50"
            />
          ) : (
            <span
              className="flex-1 truncate text-xs text-neutral-200 select-none"
              onDoubleClick={(e) => {
                e.stopPropagation()
                setEditing(true)
              }}
            >
              {layer.name}
            </span>
          )}

          {/* Actions */}
          <div className="absolute right-0 flex items-center gap-0.5 rounded-md bg-neutral-800/90 px-0.5 opacity-0 backdrop-blur-sm transition-opacity duration-150 group-hover:opacity-100">
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleLock(layer.id)
              }}
              className="rounded p-1 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              {layer.locked ? <Lock size={13} /> : <Unlock size={13} />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleVisibility(layer.id)
              }}
              className="rounded p-1 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                removeLayer(layer.id)
              }}
              className="rounded p-1 text-neutral-400 transition-colors hover:bg-red-500/20 hover:text-red-400"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Opacity slider (only for active) */}
        {isActive && (
          <div className="flex items-center gap-2 pr-0.5 pl-10">
            <Slider
              value={[layer.opacity * 100]}
              min={0}
              max={100}
              step={1}
              onValueChange={([v]) => setOpacity(layer.id, v / 100)}
              className="flex-1"
            />
            <span className="w-7 shrink-0 text-right text-[11px] text-neutral-500 tabular-nums">
              {Math.round(layer.opacity * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* Render group children */}
      {isGroup &&
        layer.expanded &&
        layer.children
          .slice()
          .reverse()
          .map((child) => <LayerItem key={child.id} layerId={child.id} depth={depth + 1} />)}
    </>
  )
}

function toggleGroupExpanded(layers: Layer[], id: string): Layer[] {
  return layers.map((l) => {
    if (l.id === id && l.type === 'group') {
      return { ...l, expanded: !l.expanded }
    }
    if (l.type === 'group') {
      const children = toggleGroupExpanded(l.children, id)
      if (children !== l.children) return { ...l, children }
    }
    return l
  })
}
