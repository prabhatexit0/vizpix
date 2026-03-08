import type { Viewport } from '@/store/types'
import type { SnapGuide } from '@/lib/snap-utils'

interface SnapGuidesOverlayProps {
  canvasRect: { width: number; height: number } | null
  viewport: Viewport
  getSnapGuides: () => SnapGuide[]
}

export function SnapGuidesOverlay({ canvasRect, viewport, getSnapGuides }: SnapGuidesOverlayProps) {
  const guides = getSnapGuides()

  if (!canvasRect || guides.length === 0) return null

  const cx = canvasRect.width / 2 + viewport.panX
  const cy = canvasRect.height / 2 + viewport.panY

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full">
      {guides.map((g, i) => {
        if (g.axis === 'x') {
          const screenX = cx + g.position * viewport.zoom
          return (
            <line
              key={`x-${i}`}
              x1={screenX}
              y1={0}
              x2={screenX}
              y2={canvasRect.height}
              stroke="#ff44ff"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          )
        } else {
          const screenY = cy + g.position * viewport.zoom
          return (
            <line
              key={`y-${i}`}
              x1={0}
              y1={screenY}
              x2={canvasRect.width}
              y2={screenY}
              stroke="#ff44ff"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          )
        }
      })}
    </svg>
  )
}
