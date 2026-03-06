import { useMemo, useState, useEffect } from 'react'
import { useEditorStore } from '@/store'
import type { Viewport } from '@/store/types'
import { findLayerById, getLayerDimensions } from '@/lib/layer-utils'

interface SelectionOutlineProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  layerId: string
  viewport: Viewport
}

export function SelectionOutline({ canvasRef, layerId, viewport }: SelectionOutlineProps) {
  const layer = useEditorStore((s) => findLayerById(s.layers, layerId))

  const [canvasRect, setCanvasRect] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    setCanvasRect({ width: rect.width, height: rect.height })
  }, [canvasRef, viewport])

  const corners = useMemo(() => {
    if (!layer || !canvasRect) return null

    const cx = canvasRect.width / 2 + viewport.panX
    const cy = canvasRect.height / 2 + viewport.panY

    const dims = getLayerDimensions(layer)
    const { x, y, scaleX, scaleY, rotation } = layer.transform
    const hw = (dims.width * scaleX * viewport.zoom) / 2
    const hh = (dims.height * scaleY * viewport.zoom) / 2
    const rad = (rotation * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)

    const worldX = cx + x * viewport.zoom
    const worldY = cy + y * viewport.zoom

    const pts = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ]

    return pts.map(([px, py]) => ({
      x: worldX + px * cos - py * sin,
      y: worldY + px * sin + py * cos,
    }))
  }, [layer, canvasRect, viewport])

  if (!corners || !layer) return null

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full">
      <polygon
        points={corners.map((c) => `${c.x},${c.y}`).join(' ')}
        fill="none"
        stroke="#3b82f6"
        strokeWidth={1}
        opacity={0.6}
        pointerEvents="none"
      />
    </svg>
  )
}
