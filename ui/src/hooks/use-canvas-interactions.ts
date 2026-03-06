import { useCallback, useRef } from 'react'
import { useEditorStore } from '@/store'
import type { Layer, ToolMode } from '@/store/types'
import { getAlphaCache } from '@/lib/hit-test-cache'
import { getLayerDimensions, findLayerById } from '@/lib/layer-utils'

interface PointerState {
  down: boolean
  startX: number
  startY: number
  startWX: number
  startWY: number
  lastX: number
  lastY: number
  movedLayer: boolean
}

export interface DrawPreview {
  x: number
  y: number
  width: number
  height: number
}

function screenToWorld(
  sx: number,
  sy: number,
  canvas: HTMLCanvasElement,
): { wx: number; wy: number } {
  const rect = canvas.getBoundingClientRect()
  const cx = sx - rect.left
  const cy = sy - rect.top
  const w = rect.width
  const h = rect.height
  const { viewport } = useEditorStore.getState()
  const wx = (cx - w / 2 - viewport.panX) / viewport.zoom
  const wy = (cy - h / 2 - viewport.panY) / viewport.zoom
  return { wx, wy }
}

function hitTestLayer(layer: Layer, wx: number, wy: number): string | null {
  if (!layer.visible || layer.locked) return null

  const { x, y, scaleX, scaleY, rotation } = layer.transform
  const rad = (-rotation * Math.PI) / 180
  const dx = wx - x
  const dy = wy - y
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const lx = (dx * cos - dy * sin) / scaleX
  const ly = (dx * sin + dy * cos) / scaleY

  switch (layer.type) {
    case 'image': {
      if (Math.abs(lx) > layer.width / 2 || Math.abs(ly) > layer.height / 2) return null
      const alphaMap = getAlphaCache(
        layer.id,
        layer.imageBytes,
        layer.imageBitmap,
        layer.width,
        layer.height,
      )
      if (alphaMap) {
        const px = Math.floor(lx + layer.width / 2)
        const py = Math.floor(ly + layer.height / 2)
        if (px >= 0 && px < alphaMap.width && py >= 0 && py < alphaMap.height) {
          if (alphaMap.data[py * alphaMap.width + px] <= 10) return null
        }
      }
      return layer.id
    }

    case 'shape': {
      const { width, height, shapeType, stroke } = layer
      const hw = width / 2
      const hh = height / 2

      switch (shapeType) {
        case 'rectangle':
          if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) return layer.id
          break
        case 'ellipse':
          if (hw > 0 && hh > 0 && (lx * lx) / (hw * hw) + (ly * ly) / (hh * hh) <= 1)
            return layer.id
          break
        case 'line': {
          const dist = Math.abs(ly)
          const hitWidth = Math.max(stroke.width / 2, 4)
          if (Math.abs(lx) <= hw && dist <= hitWidth) return layer.id
          break
        }
        case 'polygon':
          if (layer.points.length >= 3 && pointInPolygon(lx, ly, layer.points)) return layer.id
          break
      }
      return null
    }

    case 'text': {
      const dims = getLayerDimensions(layer)
      if (Math.abs(lx) <= dims.width / 2 && Math.abs(ly) <= dims.height / 2) return layer.id
      return null
    }

    case 'group': {
      for (let i = layer.children.length - 1; i >= 0; i--) {
        const hit = hitTestLayer(layer.children[i], lx, ly)
        if (hit) return hit
      }
      return null
    }
  }
}

function pointInPolygon(px: number, py: number, points: { x: number; y: number }[]): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x
    const yi = points[i].y
    const xj = points[j].x
    const yj = points[j].y
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

// Module-level callback for text cursor positioning during inline editing
let textCursorClickCallback: ((wx: number, wy: number) => void) | null = null

export function setTextCursorClickCallback(cb: ((wx: number, wy: number) => void) | null) {
  textCursorClickCallback = cb
}

function hitTestLayers(wx: number, wy: number) {
  const { layers } = useEditorStore.getState()
  for (let i = layers.length - 1; i >= 0; i--) {
    const hit = hitTestLayer(layers[i], wx, wy)
    if (hit) return hit
  }
  return null
}

function isDrawTool(tool: ToolMode): boolean {
  return tool === 'draw-rectangle' || tool === 'draw-ellipse' || tool === 'draw-text'
}

function computeDrawRect(
  startWX: number,
  startWY: number,
  wx: number,
  wy: number,
  shiftKey: boolean,
) {
  let w = wx - startWX
  let h = wy - startWY

  if (shiftKey) {
    const size = Math.max(Math.abs(w), Math.abs(h))
    w = Math.sign(w) * size
    h = Math.sign(h) * size
  }

  const x = startWX + w / 2
  const y = startWY + h / 2

  return { x, y, width: Math.abs(w), height: Math.abs(h) }
}

const MIN_DRAW_SIZE = 4

export function useCanvasInteractions(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const ptrRef = useRef<PointerState>({
    down: false,
    startX: 0,
    startY: 0,
    startWX: 0,
    startWY: 0,
    lastX: 0,
    lastY: 0,
    movedLayer: false,
  })
  const tempHandRef = useRef(false)
  const drawPreviewRef = useRef<DrawPreview | null>(null)
  const lastClickRef = useRef<{ time: number; layerId: string | null }>({ time: 0, layerId: null })

  const getEffectiveTool = useCallback((): ToolMode => {
    if (tempHandRef.current) return 'hand'
    return useEditorStore.getState().activeTool
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.setPointerCapture(e.pointerId)

      const ptr = ptrRef.current
      ptr.down = true
      ptr.startX = e.clientX
      ptr.startY = e.clientY
      ptr.lastX = e.clientX
      ptr.lastY = e.clientY
      ptr.movedLayer = false

      const { wx, wy } = screenToWorld(e.clientX, e.clientY, canvas)
      ptr.startWX = wx
      ptr.startWY = wy

      const tool = getEffectiveTool()

      if (tool === 'pointer' || tool === 'crop') {
        const { editingTextLayerId } = useEditorStore.getState()

        // While editing text, intercept clicks for cursor positioning
        if (editingTextLayerId) {
          const hitId = hitTestLayers(wx, wy)
          if (hitId === editingTextLayerId) {
            textCursorClickCallback?.(wx, wy)
            ptr.down = false
            return
          }
          // Click outside the editing layer → commit
          useEditorStore.getState().setEditingTextLayerId(null)
        }

        const hitId = hitTestLayers(wx, wy)

        // Double-click detection for text editing
        const now = Date.now()
        const last = lastClickRef.current
        if (hitId && hitId === last.layerId && now - last.time < 400) {
          const store = useEditorStore.getState()
          const layer = findLayerById(store.layers, hitId)
          if (layer?.type === 'text') {
            store.setEditingTextLayerId(hitId)
            lastClickRef.current = { time: 0, layerId: null }
            ptr.down = false
            return
          }
        }
        lastClickRef.current = { time: now, layerId: hitId }

        useEditorStore.getState().setActiveLayer(hitId)
      } else if (tool === 'zoom') {
        const factor = e.altKey ? 0.8 : 1.25
        const rect = canvas.getBoundingClientRect()
        useEditorStore
          .getState()
          .zoom(
            factor,
            e.clientX - rect.left - rect.width / 2,
            e.clientY - rect.top - rect.height / 2,
          )
      } else if (isDrawTool(tool)) {
        drawPreviewRef.current = { x: wx, y: wy, width: 0, height: 0 }
      }
    },
    [canvasRef, getEffectiveTool],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const ptr = ptrRef.current
      if (!ptr.down) return
      const canvas = canvasRef.current
      if (!canvas) return

      const dx = e.clientX - ptr.lastX
      const dy = e.clientY - ptr.lastY
      ptr.lastX = e.clientX
      ptr.lastY = e.clientY

      const tool = getEffectiveTool()

      if (tool === 'hand') {
        useEditorStore.getState().pan(dx, dy)
      } else if (tool === 'pointer') {
        const { activeLayerId, layers, viewport, editingTextLayerId } = useEditorStore.getState()
        if (!activeLayerId || editingTextLayerId) return
        const layer = findLayerById(layers, activeLayerId)
        if (!layer || layer.locked) return

        if (!ptr.movedLayer) {
          useEditorStore.getState().pushSnapshot()
          ptr.movedLayer = true
        }

        useEditorStore.getState().setTransform(activeLayerId, {
          x: layer.transform.x + dx / viewport.zoom,
          y: layer.transform.y + dy / viewport.zoom,
        })
      } else if (isDrawTool(tool)) {
        const { wx, wy } = screenToWorld(e.clientX, e.clientY, canvas)
        drawPreviewRef.current = computeDrawRect(ptr.startWX, ptr.startWY, wx, wy, e.shiftKey)
      }
    },
    [canvasRef, getEffectiveTool],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current
      if (canvas) canvas.releasePointerCapture(e.pointerId)

      const tool = getEffectiveTool()

      if (isDrawTool(tool) && ptrRef.current.down) {
        const { wx, wy } = canvas ? screenToWorld(e.clientX, e.clientY, canvas) : { wx: 0, wy: 0 }
        const rect = computeDrawRect(
          ptrRef.current.startWX,
          ptrRef.current.startWY,
          wx,
          wy,
          e.shiftKey,
        )

        const isClick = rect.width < MIN_DRAW_SIZE && rect.height < MIN_DRAW_SIZE

        // If barely dragged, use default size centered at click point
        if (isClick) {
          rect.x = ptrRef.current.startWX
          rect.y = ptrRef.current.startWY
          rect.width = 200
          rect.height = tool === 'draw-text' ? 0 : 200
        }

        const store = useEditorStore.getState()
        if (tool === 'draw-rectangle') {
          store.addShapeLayer('rectangle', rect)
        } else if (tool === 'draw-ellipse') {
          store.addShapeLayer('ellipse', rect)
        } else if (tool === 'draw-text') {
          // Click = auto-width (no rect), drag = fixed-width
          store.addTextLayer(isClick ? undefined : rect)
        }

        store.setActiveTool('pointer')
        drawPreviewRef.current = null
      }

      ptrRef.current.down = false
    },
    [canvasRef, getEffectiveTool],
  )

  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const factor = e.deltaY < 0 ? 1.1 : 0.9
      useEditorStore
        .getState()
        .zoom(
          factor,
          e.clientX - rect.left - rect.width / 2,
          e.clientY - rect.top - rect.height / 2,
        )
    },
    [canvasRef],
  )

  const setTempHand = useCallback((active: boolean) => {
    tempHandRef.current = active
  }, [])

  const getDrawPreview = useCallback((): DrawPreview | null => {
    return drawPreviewRef.current
  }, [])

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
    setTempHand,
    getDrawPreview,
  }
}
