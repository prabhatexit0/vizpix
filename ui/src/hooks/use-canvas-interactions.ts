import { useCallback, useRef, useState } from 'react'
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
      const TEXT_HIT_PAD = 8
      const hw = Math.max((dims.width * Math.abs(scaleX)) / 2 + TEXT_HIT_PAD * Math.abs(scaleX), 50)
      const hh = Math.max(
        (dims.height * Math.abs(scaleY)) / 2 + TEXT_HIT_PAD * Math.abs(scaleY),
        15,
      )
      // Use un-rotated but not un-scaled coords for hit test
      const rx = dx * cos - dy * sin
      const ry = dx * sin + dy * cos
      if (Math.abs(rx) <= hw && Math.abs(ry) <= hh) return layer.id
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

interface TouchPointer {
  x: number
  y: number
}

function pointerDistance(a: TouchPointer, b: TouchPointer): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function pointerMidpoint(a: TouchPointer, b: TouchPointer): TouchPointer {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function pointerAngle(a: TouchPointer, b: TouchPointer): number {
  return Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI)
}

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

  // Multi-touch tracking for pinch-to-zoom, two-finger pan, and rotation
  const touchPointersRef = useRef<Map<number, TouchPointer>>(new Map())
  const lastPinchDistRef = useRef<number | null>(null)
  const lastPinchMidRef = useRef<TouchPointer | null>(null)
  const lastPinchAngleRef = useRef<number | null>(null)
  const rotationGestureRef = useRef<{ layerId: string; snapshotPushed: boolean } | null>(null)
  const rotationHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rotationActiveRef = useRef(false)

  const getEffectiveTool = useCallback((): ToolMode => {
    if (tempHandRef.current) return 'hand'
    return useEditorStore.getState().activeTool
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.setPointerCapture(e.pointerId)

      // Track touch pointers for multi-touch gestures
      if (e.pointerType === 'touch') {
        touchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (touchPointersRef.current.size === 2) {
          const [a, b] = [...touchPointersRef.current.values()]
          lastPinchDistRef.current = pointerDistance(a, b)
          lastPinchMidRef.current = pointerMidpoint(a, b)
          lastPinchAngleRef.current = pointerAngle(a, b)
          rotationActiveRef.current = false
          rotationGestureRef.current = null
          if (rotationHoldTimerRef.current) {
            clearTimeout(rotationHoldTimerRef.current)
            rotationHoldTimerRef.current = null
          }

          // Check if both fingers are on/near the selected layer for rotation
          const { activeLayerId, layers } = useEditorStore.getState()
          if (activeLayerId) {
            const layer = findLayerById(layers, activeLayerId)
            if (layer && !layer.locked) {
              const wA = screenToWorld(a.x, a.y, canvas)
              const wB = screenToWorld(b.x, b.y, canvas)
              const hitA = hitTestLayer(layer, wA.wx, wA.wy)
              const hitB = hitTestLayer(layer, wB.wx, wB.wy)
              if (hitA && hitB) {
                rotationGestureRef.current = { layerId: activeLayerId, snapshotPushed: false }
                rotationHoldTimerRef.current = setTimeout(() => {
                  rotationActiveRef.current = true
                  rotationHoldTimerRef.current = null
                }, 200)
              }
            }
          }

          // Cancel any single-pointer drag in progress
          ptrRef.current.down = false
          return
        }
        if (touchPointersRef.current.size > 2) return
      }

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

        // Double-click detection
        const now = Date.now()
        const last = lastClickRef.current
        if (now - last.time < 400) {
          if (hitId && hitId === last.layerId) {
            const store = useEditorStore.getState()
            const layer = findLayerById(store.layers, hitId)
            if (layer?.type === 'text') {
              store.setEditingTextLayerId(hitId)
              lastClickRef.current = { time: 0, layerId: null }
              ptr.down = false
              return
            }
          } else if (!hitId && last.layerId === null) {
            // Double-click on empty canvas → create text layer at click point
            const store = useEditorStore.getState()
            const { documentWidth, documentHeight } = store
            const halfW = documentWidth / 2
            const halfH = documentHeight / 2
            // Clamp position to within document bounds with padding
            const pad = 10
            const clampedX = Math.max(-halfW + pad, Math.min(halfW - pad, wx))
            const clampedY = Math.max(-halfH + pad, Math.min(halfH - pad, wy))
            store.addTextLayer({ x: clampedX, y: clampedY, width: 0, height: 0 })
            useEditorStore.setState({ activeTool: 'pointer' })
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
      const canvas = canvasRef.current
      if (!canvas) return

      // Handle multi-touch pinch-to-zoom and two-finger pan
      if (e.pointerType === 'touch' && touchPointersRef.current.has(e.pointerId)) {
        touchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (touchPointersRef.current.size === 2 && lastPinchDistRef.current !== null) {
          const [a, b] = [...touchPointersRef.current.values()]
          const dist = pointerDistance(a, b)
          const factor = dist / lastPinchDistRef.current
          lastPinchDistRef.current = dist

          // Cancel rotation hold if significant pinch (distance change > 15%) before hold completes
          if (
            rotationHoldTimerRef.current &&
            !rotationActiveRef.current &&
            Math.abs(factor - 1) > 0.15
          ) {
            clearTimeout(rotationHoldTimerRef.current)
            rotationHoldTimerRef.current = null
            rotationGestureRef.current = null
          }

          const mid = pointerMidpoint(a, b)
          const rect = canvas.getBoundingClientRect()
          const centerX = mid.x - rect.left - rect.width / 2
          const centerY = mid.y - rect.top - rect.height / 2
          useEditorStore.getState().zoom(factor, centerX, centerY)

          // Two-finger pan: track midpoint movement
          if (lastPinchMidRef.current) {
            const panDx = mid.x - lastPinchMidRef.current.x
            const panDy = mid.y - lastPinchMidRef.current.y
            useEditorStore.getState().pan(panDx, panDy)
          }
          lastPinchMidRef.current = mid

          // Two-finger rotation: apply when hold threshold met and fingers on layer
          if (
            rotationActiveRef.current &&
            rotationGestureRef.current &&
            lastPinchAngleRef.current !== null
          ) {
            const angle = pointerAngle(a, b)
            let delta = angle - lastPinchAngleRef.current
            // Normalize delta to [-180, 180]
            if (delta > 180) delta -= 360
            if (delta < -180) delta += 360

            const gesture = rotationGestureRef.current
            const store = useEditorStore.getState()
            const layer = findLayerById(store.layers, gesture.layerId)
            if (layer) {
              if (!gesture.snapshotPushed) {
                store.pushSnapshot()
                gesture.snapshotPushed = true
              }
              let newRotation = layer.transform.rotation + delta
              // Snap to 0/90/180/270 when within 5°
              const snapAngles = [0, 90, 180, 270, -90, -180, -270]
              for (const snap of snapAngles) {
                if (Math.abs(newRotation - snap) < 5) {
                  newRotation = snap
                  break
                }
              }
              store.setTransform(gesture.layerId, { rotation: newRotation })
            }
          }
          lastPinchAngleRef.current = pointerAngle(a, b)
          return
        }
      }

      const ptr = ptrRef.current
      if (!ptr.down) return

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

      // Clean up touch pointer tracking
      if (e.pointerType === 'touch') {
        touchPointersRef.current.delete(e.pointerId)
        if (touchPointersRef.current.size < 2) {
          lastPinchDistRef.current = null
          lastPinchMidRef.current = null
          lastPinchAngleRef.current = null
          rotationActiveRef.current = false
          rotationGestureRef.current = null
          if (rotationHoldTimerRef.current) {
            clearTimeout(rotationHoldTimerRef.current)
            rotationHoldTimerRef.current = null
          }
        }
      }

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
          store.setActiveTool('pointer')
        } else if (tool === 'draw-ellipse') {
          store.addShapeLayer('ellipse', rect)
          store.setActiveTool('pointer')
        } else if (tool === 'draw-text') {
          // Click = auto-width at click point, drag = fixed-width box
          store.addTextLayer(isClick ? { x: rect.x, y: rect.y, width: 0, height: 0 } : rect)
          // Switch tool without cleanup — the text layer is empty and that's expected
          useEditorStore.setState({ activeTool: 'pointer' })
        }
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

  const [hoverCursor, setHoverCursor] = useState<string | null>(null)
  const hoverThrottleRef = useRef(0)

  const onHoverMove = useCallback(
    (e: React.PointerEvent) => {
      if (ptrRef.current.down) return
      const now = Date.now()
      if (now - hoverThrottleRef.current < 50) return
      hoverThrottleRef.current = now

      const tool = getEffectiveTool()
      if (tool !== 'pointer') {
        if (hoverCursor) setHoverCursor(null)
        return
      }

      const canvas = canvasRef.current
      if (!canvas) return
      const { wx, wy } = screenToWorld(e.clientX, e.clientY, canvas)
      const hitId = hitTestLayers(wx, wy)

      if (hitId) {
        const layer = findLayerById(useEditorStore.getState().layers, hitId)
        setHoverCursor(layer?.type === 'text' ? 'text' : null)
      } else {
        setHoverCursor(null)
      }
    },
    [canvasRef, getEffectiveTool, hoverCursor],
  )

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
    setTempHand,
    getDrawPreview,
    hoverCursor,
    onHoverMove,
  }
}
