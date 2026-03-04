import { useMemo, useCallback, useRef, useState, useEffect } from 'react'
import { useEditorStore } from '@/store'
import type { Viewport } from '@/store/types'

interface CropOverlayProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  layerId: string
  viewport: Viewport
}

interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

const HANDLE_SIZE = 10

type HandleType = 'tl' | 'tr' | 'br' | 'bl' | 't' | 'r' | 'b' | 'l' | 'body'

interface DragState {
  handle: HandleType
  startScreenX: number
  startScreenY: number
  startRect: CropRect
  rotationRad: number
}

export function CropOverlay({ canvasRef, layerId, viewport }: CropOverlayProps) {
  const layer = useEditorStore((s) => s.layers.find((l) => l.id === layerId))
  const applyWasmToLayer = useEditorStore((s) => s.applyWasmToLayer)
  const setTransform = useEditorStore((s) => s.setTransform)
  const setActiveTool = useEditorStore((s) => s.setActiveTool)
  const processing = useEditorStore((s) => s.processing)
  const setProcessing = useEditorStore((s) => s.setProcessing)

  const [cropRect, setCropRect] = useState<CropRect>({ x: 0, y: 0, width: 0, height: 0 })
  const dragRef = useRef<DragState | null>(null)
  const prevLayerRef = useRef<string | null>(null)

  // Initialize crop rect when layer changes
  useEffect(() => {
    if (layer && layer.id !== prevLayerRef.current) {
      setCropRect({ x: 0, y: 0, width: layer.width, height: layer.height })
      prevLayerRef.current = layer.id
    }
  }, [layer])

  // Convert local pixel coords to screen coords
  const localToScreen = useCallback(
    (lx: number, ly: number) => {
      if (!layer || !canvasRef.current) return { x: 0, y: 0 }
      const canvas = canvasRef.current
      const rect = canvas.getBoundingClientRect()
      const cx = rect.width / 2 + viewport.panX
      const cy = rect.height / 2 + viewport.panY

      const { x: tx, y: ty, scaleX, scaleY, rotation } = layer.transform
      const rad = (rotation * Math.PI) / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)

      // local pixel -> center-relative (layer origin is center)
      const relX = (lx - layer.width / 2) * scaleX
      const relY = (ly - layer.height / 2) * scaleY

      // rotate
      const rx = relX * cos - relY * sin
      const ry = relX * sin + relY * cos

      // translate + viewport
      return {
        x: cx + (tx + rx) * viewport.zoom,
        y: cy + (ty + ry) * viewport.zoom,
      }
    },
    [layer, canvasRef, viewport],
  )

  // Convert screen delta to local pixel delta
  const screenDeltaToLocal = useCallback(
    (sdx: number, sdy: number) => {
      if (!layer) return { dx: 0, dy: 0 }
      const { scaleX, scaleY, rotation } = layer.transform
      const rad = (-rotation * Math.PI) / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)

      // undo zoom
      const wdx = sdx / viewport.zoom
      const wdy = sdy / viewport.zoom

      // undo rotation
      const rdx = wdx * cos - wdy * sin
      const rdy = wdx * sin + wdy * cos

      // undo scale
      return { dx: rdx / scaleX, dy: rdy / scaleY }
    },
    [layer, viewport.zoom],
  )

  const corners = useMemo(() => {
    if (!layer || !canvasRef.current) return null
    const { x, y, width, height } = cropRect
    return {
      tl: localToScreen(x, y),
      tr: localToScreen(x + width, y),
      br: localToScreen(x + width, y + height),
      bl: localToScreen(x, y + height),
    }
  }, [cropRect, localToScreen, layer, canvasRef])

  // Full layer corners for the dimming mask
  const layerCorners = useMemo(() => {
    if (!layer || !canvasRef.current) return null
    return {
      tl: localToScreen(0, 0),
      tr: localToScreen(layer.width, 0),
      br: localToScreen(layer.width, layer.height),
      bl: localToScreen(0, layer.height),
    }
  }, [layer, canvasRef, localToScreen])

  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent, handle: HandleType) => {
      e.stopPropagation()
      e.preventDefault()
      if (!layer) return

      const el = e.currentTarget as Element
      el.setPointerCapture(e.pointerId)

      dragRef.current = {
        handle,
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        startRect: { ...cropRect },
        rotationRad: (layer.transform.rotation * Math.PI) / 180,
      }
    },
    [layer, cropRect],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current
      if (!drag || !layer) return

      const sdx = e.clientX - drag.startScreenX
      const sdy = e.clientY - drag.startScreenY
      const { dx, dy } = screenDeltaToLocal(sdx, sdy)
      const { startRect } = drag
      const maxW = layer.width
      const maxH = layer.height

      let newRect = { ...startRect }

      switch (drag.handle) {
        case 'tl': {
          const nx = Math.max(0, Math.min(startRect.x + dx, startRect.x + startRect.width - 1))
          const ny = Math.max(0, Math.min(startRect.y + dy, startRect.y + startRect.height - 1))
          newRect = {
            x: nx,
            y: ny,
            width: startRect.x + startRect.width - nx,
            height: startRect.y + startRect.height - ny,
          }
          break
        }
        case 'tr': {
          const nw = Math.max(1, Math.min(startRect.width + dx, maxW - startRect.x))
          const ny = Math.max(0, Math.min(startRect.y + dy, startRect.y + startRect.height - 1))
          newRect = {
            x: startRect.x,
            y: ny,
            width: nw,
            height: startRect.y + startRect.height - ny,
          }
          break
        }
        case 'br': {
          newRect = {
            x: startRect.x,
            y: startRect.y,
            width: Math.max(1, Math.min(startRect.width + dx, maxW - startRect.x)),
            height: Math.max(1, Math.min(startRect.height + dy, maxH - startRect.y)),
          }
          break
        }
        case 'bl': {
          const nx = Math.max(0, Math.min(startRect.x + dx, startRect.x + startRect.width - 1))
          const nh = Math.max(1, Math.min(startRect.height + dy, maxH - startRect.y))
          newRect = {
            x: nx,
            y: startRect.y,
            width: startRect.x + startRect.width - nx,
            height: nh,
          }
          break
        }
        case 't': {
          const ny = Math.max(0, Math.min(startRect.y + dy, startRect.y + startRect.height - 1))
          newRect = {
            x: startRect.x,
            y: ny,
            width: startRect.width,
            height: startRect.y + startRect.height - ny,
          }
          break
        }
        case 'r': {
          newRect = {
            x: startRect.x,
            y: startRect.y,
            width: Math.max(1, Math.min(startRect.width + dx, maxW - startRect.x)),
            height: startRect.height,
          }
          break
        }
        case 'b': {
          newRect = {
            x: startRect.x,
            y: startRect.y,
            width: startRect.width,
            height: Math.max(1, Math.min(startRect.height + dy, maxH - startRect.y)),
          }
          break
        }
        case 'l': {
          const nx = Math.max(0, Math.min(startRect.x + dx, startRect.x + startRect.width - 1))
          newRect = {
            x: nx,
            y: startRect.y,
            width: startRect.x + startRect.width - nx,
            height: startRect.height,
          }
          break
        }
        case 'body': {
          let nx = startRect.x + dx
          let ny = startRect.y + dy
          nx = Math.max(0, Math.min(nx, maxW - startRect.width))
          ny = Math.max(0, Math.min(ny, maxH - startRect.height))
          newRect = { x: nx, y: ny, width: startRect.width, height: startRect.height }
          break
        }
      }

      setCropRect(newRect)
    },
    [layer, screenDeltaToLocal],
  )

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const el = e.currentTarget as Element
    el.releasePointerCapture(e.pointerId)
    dragRef.current = null
  }, [])

  const handleApply = useCallback(async () => {
    if (!layer || processing) return

    const { x, y, width, height } = cropRect
    const cx = Math.round(x)
    const cy = Math.round(y)
    const cw = Math.round(width)
    const ch = Math.round(height)

    if (cw <= 0 || ch <= 0) return

    setProcessing(true)
    try {
      const { crop_image } = await import('@/wasm/vizpix-core/vizpix_core')
      const result = crop_image(layer.imageBytes, cx, cy, cw, ch)
      await applyWasmToLayer(layerId, result)

      // Adjust layer position so content doesn't visually jump
      const offsetX = cx + cw / 2 - layer.width / 2
      const offsetY = cy + ch / 2 - layer.height / 2

      // Transform offset through rotation + scale to world space
      const { scaleX, scaleY, rotation } = layer.transform
      const rad = (rotation * Math.PI) / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)
      const scaledX = offsetX * scaleX
      const scaledY = offsetY * scaleY
      const worldOffsetX = scaledX * cos - scaledY * sin
      const worldOffsetY = scaledX * sin + scaledY * cos

      setTransform(layerId, {
        x: layer.transform.x + worldOffsetX,
        y: layer.transform.y + worldOffsetY,
      })
    } finally {
      setProcessing(false)
    }
    setActiveTool('pointer')
  }, [
    layer,
    layerId,
    cropRect,
    processing,
    applyWasmToLayer,
    setTransform,
    setActiveTool,
    setProcessing,
  ])

  const handleCancel = useCallback(() => {
    setActiveTool('pointer')
  }, [setActiveTool])

  if (!corners || !layerCorners || !layer) return null

  const midpoints = {
    t: { x: (corners.tl.x + corners.tr.x) / 2, y: (corners.tl.y + corners.tr.y) / 2 },
    r: { x: (corners.tr.x + corners.br.x) / 2, y: (corners.tr.y + corners.br.y) / 2 },
    b: { x: (corners.bl.x + corners.br.x) / 2, y: (corners.bl.y + corners.br.y) / 2 },
    l: { x: (corners.tl.x + corners.bl.x) / 2, y: (corners.tl.y + corners.bl.y) / 2 },
  }

  const half = HANDLE_SIZE / 2

  // Position apply/cancel buttons below bottom-right corner
  const btnX = corners.br.x
  const btnY = corners.br.y + 12

  const cornerHandles: { key: HandleType; pt: { x: number; y: number }; cursor: string }[] = [
    { key: 'tl', pt: corners.tl, cursor: 'nwse-resize' },
    { key: 'tr', pt: corners.tr, cursor: 'nesw-resize' },
    { key: 'br', pt: corners.br, cursor: 'nwse-resize' },
    { key: 'bl', pt: corners.bl, cursor: 'nesw-resize' },
  ]

  const midHandles: { key: HandleType; pt: { x: number; y: number }; cursor: string }[] = [
    { key: 't', pt: midpoints.t, cursor: 'ns-resize' },
    { key: 'r', pt: midpoints.r, cursor: 'ew-resize' },
    { key: 'b', pt: midpoints.b, cursor: 'ns-resize' },
    { key: 'l', pt: midpoints.l, cursor: 'ew-resize' },
  ]

  // Dimming mask: outer path (full layer) with inner cutout (crop rect) using evenodd
  const outerPath = `M ${layerCorners.tl.x},${layerCorners.tl.y} L ${layerCorners.tr.x},${layerCorners.tr.y} L ${layerCorners.br.x},${layerCorners.br.y} L ${layerCorners.bl.x},${layerCorners.bl.y} Z`
  const innerPath = `M ${corners.tl.x},${corners.tl.y} L ${corners.tr.x},${corners.tr.y} L ${corners.br.x},${corners.br.y} L ${corners.bl.x},${corners.bl.y} Z`

  return (
    <>
      <svg className="pointer-events-none absolute inset-0 h-full w-full">
        {/* Dimming mask */}
        <path d={`${outerPath} ${innerPath}`} fillRule="evenodd" fill="rgba(0,0,0,0.5)" />

        {/* Crop border */}
        <polygon
          points={`${corners.tl.x},${corners.tl.y} ${corners.tr.x},${corners.tr.y} ${corners.br.x},${corners.br.y} ${corners.bl.x},${corners.bl.y}`}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={1.5}
        />

        {/* Body drag area */}
        <polygon
          points={`${corners.tl.x},${corners.tl.y} ${corners.tr.x},${corners.tr.y} ${corners.br.x},${corners.br.y} ${corners.bl.x},${corners.bl.y}`}
          fill="transparent"
          className="pointer-events-auto"
          style={{ cursor: 'move' }}
          onPointerDown={(e) => onHandlePointerDown(e, 'body')}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />

        {/* Corner handles */}
        {cornerHandles.map(({ key, pt, cursor }) => (
          <g
            key={key}
            className="pointer-events-auto"
            style={{ cursor }}
            onPointerDown={(e) => onHandlePointerDown(e, key)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <rect
              x={pt.x - half}
              y={pt.y - half}
              width={HANDLE_SIZE}
              height={HANDLE_SIZE}
              rx={2}
              fill="white"
              stroke="#3b82f6"
              strokeWidth={1.5}
            />
            <rect
              x={pt.x - half - 4}
              y={pt.y - half - 4}
              width={HANDLE_SIZE + 8}
              height={HANDLE_SIZE + 8}
              fill="transparent"
            />
          </g>
        ))}

        {/* Midpoint handles */}
        {midHandles.map(({ key, pt, cursor }) => (
          <g
            key={key}
            className="pointer-events-auto"
            style={{ cursor }}
            onPointerDown={(e) => onHandlePointerDown(e, key)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <rect
              x={pt.x - half}
              y={pt.y - half}
              width={HANDLE_SIZE}
              height={HANDLE_SIZE}
              rx={2}
              fill="white"
              stroke="#3b82f6"
              strokeWidth={1.5}
            />
            <rect
              x={pt.x - half - 4}
              y={pt.y - half - 4}
              width={HANDLE_SIZE + 8}
              height={HANDLE_SIZE + 8}
              fill="transparent"
            />
          </g>
        ))}
      </svg>

      {/* Apply / Cancel buttons */}
      <div
        className="pointer-events-auto absolute z-10 flex gap-1.5"
        style={{ left: btnX, top: btnY, transform: 'translateX(-100%)' }}
      >
        <button
          onClick={handleCancel}
          className="rounded bg-neutral-700 px-3 py-1 text-xs text-neutral-200 transition-colors hover:bg-neutral-600"
        >
          Cancel
        </button>
        <button
          onClick={handleApply}
          disabled={processing}
          className="rounded bg-blue-600 px-3 py-1 text-xs text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
        >
          {processing ? 'Applying...' : 'Apply'}
        </button>
      </div>
    </>
  )
}
