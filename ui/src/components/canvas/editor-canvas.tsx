import { useRef, useEffect, useCallback } from 'react'
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

  const resize = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const dpr = window.devicePixelRatio || 1
    const { width, height } = container.getBoundingClientRect()
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
  }, [])

  // ResizeObserver
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => {
      resize()
    })
    ro.observe(container)
    resize()
    return () => ro.disconnect()
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
    </div>
  )
}
