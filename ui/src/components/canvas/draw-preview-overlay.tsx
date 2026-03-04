import { useEffect, useRef } from 'react'
import type { Viewport, ToolMode } from '@/store/types'
import type { DrawPreview } from '@/hooks/use-canvas-interactions'

interface DrawPreviewOverlayProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  viewport: Viewport
  getDrawPreview: () => DrawPreview | null
  toolMode: ToolMode
}

export function DrawPreviewOverlay({
  canvasRef,
  viewport,
  getDrawPreview,
  toolMode,
}: DrawPreviewOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const shapeRef = useRef<SVGRectElement | SVGEllipseElement>(null)

  useEffect(() => {
    let raf = 0
    function tick() {
      const preview = getDrawPreview()
      const el = shapeRef.current
      const canvas = canvasRef.current
      if (!el || !canvas) {
        raf = requestAnimationFrame(tick)
        return
      }

      if (!preview || (preview.width === 0 && preview.height === 0)) {
        el.setAttribute('display', 'none')
        raf = requestAnimationFrame(tick)
        return
      }

      el.setAttribute('display', '')

      const rect = canvas.getBoundingClientRect()
      const cx = rect.width / 2 + viewport.panX
      const cy = rect.height / 2 + viewport.panY

      const screenX = cx + preview.x * viewport.zoom
      const screenY = cy + preview.y * viewport.zoom
      const screenW = preview.width * viewport.zoom
      const screenH = preview.height * viewport.zoom

      if (toolMode === 'draw-ellipse') {
        el.setAttribute('cx', String(screenX))
        el.setAttribute('cy', String(screenY))
        el.setAttribute('rx', String(screenW / 2))
        el.setAttribute('ry', String(screenH / 2))
      } else {
        el.setAttribute('x', String(screenX - screenW / 2))
        el.setAttribute('y', String(screenY - screenH / 2))
        el.setAttribute('width', String(screenW))
        el.setAttribute('height', String(screenH))
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [canvasRef, viewport, getDrawPreview, toolMode])

  return (
    <svg ref={svgRef} className="pointer-events-none absolute inset-0 h-full w-full">
      {toolMode === 'draw-ellipse' ? (
        <ellipse
          ref={shapeRef as React.RefObject<SVGEllipseElement>}
          fill="rgba(59, 130, 246, 0.15)"
          stroke="#3b82f6"
          strokeWidth={1.5}
          strokeDasharray="4 2"
          display="none"
        />
      ) : (
        <rect
          ref={shapeRef as React.RefObject<SVGRectElement>}
          fill="rgba(59, 130, 246, 0.15)"
          stroke="#3b82f6"
          strokeWidth={1.5}
          strokeDasharray="4 2"
          display="none"
        />
      )}
    </svg>
  )
}
