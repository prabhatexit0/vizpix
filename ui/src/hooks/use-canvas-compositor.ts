import { useCallback, useRef } from 'react'
import { useEditorStore } from '@/store'
import { createCheckerboardPattern } from '@/components/canvas/checkerboard'
import { renderLayerToContext } from '@/lib/layer-render'

export function useCanvasCompositor() {
  const patternRef = useRef<CanvasPattern | null>(null)

  const composite = useCallback((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { layers, viewport, canvasBg } = useEditorStore.getState()
    const dpr = window.devicePixelRatio || 1
    const w = canvas.width / dpr
    const h = canvas.height / dpr

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    // canvas background
    if (canvasBg === 'checkerboard') {
      if (!patternRef.current) {
        patternRef.current = createCheckerboardPattern(ctx)
      }
      if (patternRef.current) {
        ctx.fillStyle = patternRef.current
        ctx.fillRect(0, 0, w, h)
      }
    } else {
      ctx.fillStyle = canvasBg === 'gray' ? '#808080' : '#000000'
      ctx.fillRect(0, 0, w, h)
    }

    // viewport transform
    ctx.save()
    ctx.translate(w / 2 + viewport.panX, h / 2 + viewport.panY)
    ctx.scale(viewport.zoom, viewport.zoom)

    // document bounds
    const { documentWidth, documentHeight, documentBackground } = useEditorStore.getState()
    const docX = -documentWidth / 2
    const docY = -documentHeight / 2

    ctx.fillStyle = documentBackground
    ctx.fillRect(docX, docY, documentWidth, documentHeight)

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'
    ctx.lineWidth = 1 / viewport.zoom
    ctx.strokeRect(docX, docY, documentWidth, documentHeight)

    for (const layer of layers) {
      renderLayerToContext(ctx, layer, documentWidth, documentHeight)
    }

    // Dim area outside document bounds to signal it won't be in the export.
    // Draw a large rect with a cutout for the document using evenodd fill rule.
    const pad = Math.max(w, h) / viewport.zoom + Math.max(documentWidth, documentHeight)
    ctx.save()
    ctx.beginPath()
    ctx.rect(-pad, -pad, pad * 2, pad * 2)
    ctx.rect(docX, docY, documentWidth, documentHeight)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
    ctx.fill('evenodd')
    ctx.restore()

    ctx.restore()
  }, [])

  return { composite }
}
