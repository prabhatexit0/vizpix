import { useEffect, useRef } from 'react'
import { Trash2, Copy, Lock, Unlock, Pencil } from 'lucide-react'
import { useEditorStore } from '@/store'
import { findLayerById } from '@/lib/layer-utils'
import type { ContextMenuState } from '@/hooks/use-canvas-interactions'

interface TouchContextMenuProps {
  state: ContextMenuState
  onDismiss: () => void
}

export function TouchContextMenu({ state, onDismiss }: TouchContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const layers = useEditorStore((s) => s.layers)
  const layer = findLayerById(layers, state.layerId)

  useEffect(() => {
    const handle = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onDismiss()
      }
    }
    document.addEventListener('pointerdown', handle, true)
    return () => document.removeEventListener('pointerdown', handle, true)
  }, [onDismiss])

  if (!layer) return null

  const store = useEditorStore.getState()
  const isText = layer.type === 'text'

  // Clamp position to viewport
  const menuWidth = 160
  const menuHeight = isText ? 192 : 144
  const x = Math.min(state.screenX, window.innerWidth - menuWidth - 8)
  const y = Math.max(
    8,
    Math.min(state.screenY - menuHeight / 2, window.innerHeight - menuHeight - 8),
  )

  const itemClass =
    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-neutral-200 transition-colors hover:bg-white/10 active:bg-white/15'

  return (
    <div
      ref={menuRef}
      className="absolute z-[60] min-w-[160px] rounded-xl border border-white/15 bg-neutral-900/95 p-1.5 shadow-xl backdrop-blur-md"
      style={{ left: x, top: y }}
    >
      <button
        className={itemClass}
        onClick={() => {
          store.duplicateLayer(state.layerId)
          onDismiss()
        }}
      >
        <Copy size={16} />
        Duplicate
      </button>
      <button
        className={itemClass}
        onClick={() => {
          store.toggleLock(state.layerId)
          onDismiss()
        }}
      >
        {layer.locked ? <Unlock size={16} /> : <Lock size={16} />}
        {layer.locked ? 'Unlock' : 'Lock'}
      </button>
      {isText && (
        <button
          className={itemClass}
          onClick={() => {
            store.setEditingTextLayerId(state.layerId)
            onDismiss()
          }}
        >
          <Pencil size={16} />
          Edit
        </button>
      )}
      <div className="mx-1 my-1 h-px bg-white/10" />
      <button
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-red-400 transition-colors hover:bg-white/10 active:bg-white/15"
        onClick={() => {
          store.pushSnapshot()
          store.removeLayer(state.layerId)
          onDismiss()
        }}
      >
        <Trash2 size={16} />
        Delete
      </button>
    </div>
  )
}
