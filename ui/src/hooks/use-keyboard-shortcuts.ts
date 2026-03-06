import { useEffect, useRef } from 'react'
import { useEditorStore } from '@/store'
import type { Layer, ToolMode } from '@/store/types'
import { findLayerById, findLayerParent } from '@/lib/layer-utils'
import { deepCloneLayer } from '@/store/slices/layers-slice'

let clipboardLayer: Layer | null = null

export function useKeyboardShortcuts(
  setTempHand?: (active: boolean) => void,
  canvasRef?: React.RefObject<HTMLCanvasElement | null>,
) {
  const prevToolRef = useRef<ToolMode | null>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      const store = useEditorStore.getState()

      // Keyboard shortcuts overlay
      if (e.key === '?' && !store.editingTextLayerId) {
        store.setShowShortcuts(!store.showShortcuts)
        return
      }

      // Tool switching
      if (e.key === 'v' || e.key === 'V') {
        if (!e.ctrlKey && !e.metaKey) {
          store.setActiveTool('pointer')
          return
        }
      }
      if (e.key === 'h' || e.key === 'H') {
        store.setActiveTool('hand')
        return
      }
      if (e.key === 'z' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        store.setActiveTool('zoom')
        return
      }
      if (e.key === 'c' || e.key === 'C') {
        if (!e.ctrlKey && !e.metaKey) {
          store.setActiveTool('crop')
          return
        }
      }

      // Shape shortcuts — switch to draw mode
      if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey) {
        store.setActiveTool('draw-rectangle')
        return
      }
      if ((e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.metaKey) {
        store.setActiveTool('draw-ellipse')
        return
      }

      // Text shortcut — switch to draw mode
      if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey) {
        store.setActiveTool('draw-text')
        return
      }

      // Group: Ctrl+G
      if ((e.ctrlKey || e.metaKey) && (e.key === 'g' || e.key === 'G') && !e.shiftKey) {
        e.preventDefault()
        if (store.activeLayerId) {
          store.groupLayers([store.activeLayerId])
        }
        return
      }

      // Ungroup: Ctrl+Shift+G
      if ((e.ctrlKey || e.metaKey) && (e.key === 'g' || e.key === 'G') && e.shiftKey) {
        e.preventDefault()
        if (store.activeLayerId) {
          const layer = findLayerById(store.layers, store.activeLayerId)
          if (layer?.type === 'group') {
            store.ungroupLayer(store.activeLayerId)
          }
        }
        return
      }

      // Escape: exit crop/draw tool, or stop editing text
      if (e.key === 'Escape') {
        if (store.editingTextLayerId) {
          store.setEditingTextLayerId(null)
          return
        }
        if (store.activeTool !== 'pointer' && store.activeTool !== 'hand') {
          store.setActiveTool('pointer')
          return
        }
      }

      // Enter: start text editing on selected text layer
      if (e.key === 'Enter' && !store.editingTextLayerId && store.activeLayerId) {
        const layer = findLayerById(store.layers, store.activeLayerId)
        if (layer?.type === 'text') {
          e.preventDefault()
          store.setEditingTextLayerId(store.activeLayerId)
          return
        }
      }

      // Temp hand (space)
      if (e.key === ' ' && !e.repeat) {
        e.preventDefault()
        prevToolRef.current = store.activeTool
        store.setActiveTool('hand')
        setTempHand?.(true)
        return
      }

      // ---- Clipboard ----

      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C') && !e.shiftKey) {
        e.preventDefault()
        const layer = findLayerById(store.layers, store.activeLayerId ?? '')
        if (layer) {
          clipboardLayer = layer
        }
        return
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V') && !e.shiftKey) {
        e.preventDefault()
        if (clipboardLayer) {
          const clone = deepCloneLayer(clipboardLayer)
          clone.name = `${clipboardLayer.name} copy`
          clone.transform = {
            ...clone.transform,
            x: clipboardLayer.transform.x + 20,
            y: clipboardLayer.transform.y + 20,
          }
          store.pushSnapshot()
          useEditorStore.setState((s) => ({
            layers: [...s.layers, clone],
            activeLayerId: clone.id,
          }))
        }
        return
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'x' || e.key === 'X') && !e.shiftKey) {
        e.preventDefault()
        const layer = findLayerById(store.layers, store.activeLayerId ?? '')
        if (layer) {
          clipboardLayer = layer
          store.removeLayer(layer.id)
        }
        return
      }

      // ---- Undo / Redo ----

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        store.undo()
        return
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && e.shiftKey) {
        e.preventDefault()
        store.redo()
        return
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y') && !e.shiftKey) {
        e.preventDefault()
        store.redo()
        return
      }

      // ---- Layer management ----

      if ((e.ctrlKey || e.metaKey) && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault()
        if (store.activeLayerId) {
          store.duplicateLayer(store.activeLayerId)
        }
        return
      }

      if (e.key === ']' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (store.activeLayerId) {
          const parentInfo = findLayerParent(store.layers, store.activeLayerId)
          if (parentInfo && parentInfo.index < parentInfo.parent.length - 1) {
            const parentGroup =
              parentInfo.parent === store.layers
                ? null
                : store.layers.find((l) => l.type === 'group' && l.children === parentInfo.parent)
            store.reorderLayers(store.activeLayerId, parentInfo.index + 1, parentGroup?.id ?? null)
          }
        }
        return
      }

      if (e.key === '[' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (store.activeLayerId) {
          const parentInfo = findLayerParent(store.layers, store.activeLayerId)
          if (parentInfo && parentInfo.index > 0) {
            const parentGroup =
              parentInfo.parent === store.layers
                ? null
                : store.layers.find((l) => l.type === 'group' && l.children === parentInfo.parent)
            store.reorderLayers(store.activeLayerId, parentInfo.index - 1, parentGroup?.id ?? null)
          }
        }
        return
      }

      if (e.key === ']' && e.altKey) {
        e.preventDefault()
        if (store.layers.length > 0) {
          const idx = store.layers.findIndex((l) => l.id === store.activeLayerId)
          const next = Math.min(idx + 1, store.layers.length - 1)
          store.setActiveLayer(store.layers[next].id)
        }
        return
      }

      if (e.key === '[' && e.altKey) {
        e.preventDefault()
        if (store.layers.length > 0) {
          const idx = store.layers.findIndex((l) => l.id === store.activeLayerId)
          const prev = Math.max(idx - 1, 0)
          store.setActiveLayer(store.layers[prev].id)
        }
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (store.activeLayerId) {
          store.removeLayer(store.activeLayerId)
        }
        return
      }

      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'd' || e.key === 'D') &&
        !store.editingTextLayerId
      ) {
        e.preventDefault()
        if (store.activeLayerId) {
          store.duplicateLayer(store.activeLayerId)
        }
        return
      }

      // ---- Zoom shortcuts ----

      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+') && !e.shiftKey) {
        e.preventDefault()
        store.zoom(1.25)
        return
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.key === '_')) {
        e.preventDefault()
        store.zoom(0.8)
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault()
        store.setZoom(1)
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        const canvas = canvasRef?.current
        if (canvas) {
          const rect = canvas.getBoundingClientRect()
          store.fitToDocument(rect.width, rect.height)
        }
        return
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === ' ') {
        const prev = prevToolRef.current
        if (prev) {
          useEditorStore.getState().setActiveTool(prev)
          prevToolRef.current = null
        }
        setTempHand?.(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [setTempHand, canvasRef])
}
