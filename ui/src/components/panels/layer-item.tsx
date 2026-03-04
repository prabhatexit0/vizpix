import { useState, useRef, useCallback } from 'react'
import { Eye, EyeOff, Trash2, Lock, Unlock } from 'lucide-react'
import { useEditorStore } from '@/store'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'

interface LayerItemProps {
  layerId: string
}

export function LayerItem({ layerId }: LayerItemProps) {
  const layer = useEditorStore((s) => s.layers.find((l) => l.id === layerId))
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

  return (
    <div
      className={cn(
        'group flex cursor-pointer flex-col gap-1 rounded-lg border px-2 py-1.5 transition-all duration-150',
        isActive
          ? 'border-blue-500/60 bg-blue-500/10'
          : 'border-white/6 hover:border-white/12 hover:bg-white/4',
      )}
      onClick={() => setActiveLayer(layer.id)}
    >
      <div className="relative flex min-w-0 items-center gap-2">
        {/* Thumbnail */}
        <div className="h-8 w-8 shrink-0 overflow-hidden rounded border border-white/12 bg-neutral-800">
          {layer.imageBitmap && (
            <canvas
              className="h-full w-full object-contain"
              width={32}
              height={32}
              ref={(c) => {
                if (!c || !layer.imageBitmap) return
                const ctx = c.getContext('2d')
                if (!ctx) return
                ctx.clearRect(0, 0, 32, 32)
                const scale = Math.min(32 / layer.width, 32 / layer.height)
                const w = layer.width * scale
                const h = layer.height * scale
                ctx.drawImage(layer.imageBitmap, (32 - w) / 2, (32 - h) / 2, w, h)
              }}
            />
          )}
        </div>

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

        {/* Actions — overlays the name on hover so it doesn't affect flow */}
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
  )
}
