import { useRef, useEffect, useCallback, useState } from 'react'
import { Grid2X2 } from 'lucide-react'
import { useEditorStore } from '@/store'
import { useCanvasCompositor } from '@/hooks/use-canvas-compositor'
import { useCanvasInteractions } from '@/hooks/use-canvas-interactions'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { TransformHandles } from './transform-handles'
import { CropOverlay } from './crop-overlay'
import { DrawPreviewOverlay } from './draw-preview-overlay'
import { InlineTextEditor } from './inline-text-editor'
import { SelectionOutline } from './selection-outline'

export function EditorCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const { composite } = useCanvasCompositor()
  const {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
    setTempHand,
    getDrawPreview,
    hoverCursor,
    onHoverMove,
  } = useCanvasInteractions(canvasRef)
  useKeyboardShortcuts(setTempHand, canvasRef)

  // Native non-passive wheel listener so preventDefault() actually works.
  // React's onWheel is passive and can't prevent browser zoom.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [onWheel])

  // Prevent browser-level pinch-to-zoom on the whole page
  useEffect(() => {
    const preventGesture = (e: Event) => e.preventDefault()
    const preventCtrlWheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault()
    }
    // Safari fires gesturestart/gesturechange for pinch
    document.addEventListener('gesturestart', preventGesture)
    document.addEventListener('gesturechange', preventGesture)
    // Chrome/Firefox fire wheel+ctrlKey for trackpad pinch
    document.addEventListener('wheel', preventCtrlWheel, { passive: false })
    return () => {
      document.removeEventListener('gesturestart', preventGesture)
      document.removeEventListener('gesturechange', preventGesture)
      document.removeEventListener('wheel', preventCtrlWheel)
    }
  }, [])

  // Subscribe to trigger re-renders on layer/viewport changes
  useEditorStore((s) => s.layers)
  const viewport = useEditorStore((s) => s.viewport)
  const activeLayerId = useEditorStore((s) => s.activeLayerId)
  const activeTool = useEditorStore((s) => s.activeTool)
  const editingTextLayerId = useEditorStore((s) => s.editingTextLayerId)
  const canvasBg = useEditorStore((s) => s.canvasBg)
  const cycleCanvasBg = useEditorStore((s) => s.cycleCanvasBg)
  const setZoom = useEditorStore((s) => s.setZoom)

  // Force re-render when fonts finish loading so text layers use the correct font
  const [, setFontsLoaded] = useState(false)
  useEffect(() => {
    document.fonts.ready.then(() => setFontsLoaded(true))
  }, [])

  const resize = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const dpr = window.devicePixelRatio || 1
    const { width, height } = container.getBoundingClientRect()
    const newW = Math.round(width * dpr)
    const newH = Math.round(height * dpr)
    // Skip resize if dimensions haven't changed — avoids canvas clear flash
    if (canvas.width === newW && canvas.height === newH) return
    canvas.width = newW
    canvas.height = newH
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
  }, [])

  // ResizeObserver — throttle to RAF to avoid multiple resizes per frame
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let resizeRaf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(resizeRaf)
      resizeRaf = requestAnimationFrame(resize)
    })
    ro.observe(container)
    resize()
    return () => {
      cancelAnimationFrame(resizeRaf)
      ro.disconnect()
    }
  }, [resize])

  // Render loop
  useEffect(() => {
    function frame() {
      useEditorStore.getState().tickViewportAnimation()
      const canvas = canvasRef.current
      if (canvas) composite(canvas)
      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafRef.current)
  }, [composite])

  const isDrawTool =
    activeTool === 'draw-rectangle' || activeTool === 'draw-ellipse' || activeTool === 'draw-text'

  const cursor =
    activeTool === 'hand'
      ? 'grab'
      : activeTool === 'zoom'
        ? 'zoom-in'
        : activeTool === 'crop' || isDrawTool
          ? 'crosshair'
          : (hoverCursor ?? 'default')

  return (
    <div
      ref={containerRef}
      data-slot="editor-canvas"
      className="relative flex-1 overflow-hidden bg-neutral-950"
      style={{ willChange: 'transform' }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ cursor, touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => {
          onPointerMove(e)
          onHoverMove(e)
        }}
        onPointerUp={onPointerUp}
      />
      {activeLayerId && (
        <SelectionOutline canvasRef={canvasRef} layerId={activeLayerId} viewport={viewport} />
      )}
      {activeLayerId && activeTool === 'pointer' && (
        <TransformHandles canvasRef={canvasRef} layerId={activeLayerId} viewport={viewport} />
      )}
      {activeLayerId && activeTool === 'crop' && (
        <CropOverlay canvasRef={canvasRef} layerId={activeLayerId} viewport={viewport} />
      )}
      {isDrawTool && (
        <DrawPreviewOverlay
          canvasRef={canvasRef}
          viewport={viewport}
          getDrawPreview={getDrawPreview}
          toolMode={activeTool}
        />
      )}
      {editingTextLayerId && (
        <InlineTextEditor canvasRef={canvasRef} layerId={editingTextLayerId} viewport={viewport} />
      )}
      <div className="absolute right-2 bottom-2 z-10 flex items-center gap-1 rounded-md bg-neutral-900/80 text-xs text-neutral-400 backdrop-blur-sm">
        <button
          onClick={() => setZoom(1)}
          className="px-2 py-1 transition-colors hover:text-white"
          title="Click to reset zoom to 100%"
        >
          {Math.round(viewport.zoom * 100)}%
        </button>
        <div className="h-3 w-px bg-white/15" />
        <button
          onClick={cycleCanvasBg}
          className="flex items-center gap-1.5 px-2 py-1 transition-colors hover:text-white"
          title="Toggle canvas background"
        >
          <Grid2X2 size={12} />
          <span className="capitalize">{canvasBg === 'checkerboard' ? 'Check' : canvasBg}</span>
        </button>
      </div>
    </div>
  )
}
