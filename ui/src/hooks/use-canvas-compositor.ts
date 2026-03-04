import { useCallback, useRef } from 'react'
import { useEditorStore } from '@/store'
import { blendModeMap } from '@/lib/blend-modes'
import { createCheckerboardPattern } from '@/components/canvas/checkerboard'

export function useCanvasCompositor() {
  const patternRef = useRef<CanvasPattern | null>(null)

  const composite = useCallback((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { layers, viewport } = useEditorStore.getState()
    const dpr = window.devicePixelRatio || 1
    const w = canvas.width / dpr
    const h = canvas.height / dpr

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    // checkerboard bg
    if (!patternRef.current) {
      patternRef.current = createCheckerboardPattern(ctx)
    }
    if (patternRef.current) {
      ctx.fillStyle = patternRef.current
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
      if (!layer.visible || !layer.imageBitmap) continue

      ctx.save()
      ctx.globalAlpha = layer.opacity
      ctx.globalCompositeOperation = blendModeMap[layer.blendMode]

      const { x, y, scaleX, scaleY, rotation } = layer.transform
      const cx = x
      const cy = y
      ctx.translate(cx, cy)
      ctx.rotate((rotation * Math.PI) / 180)
      ctx.scale(scaleX, scaleY)
      ctx.drawImage(layer.imageBitmap, -layer.width / 2, -layer.height / 2)

      ctx.restore()
    }

    ctx.restore()
  }, [])

  return { composite }
}
