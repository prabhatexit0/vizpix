import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useEditorStore } from '@/store'
import type { Viewport } from '@/store/types'
import {
  findLayerById,
  measureCursorPosition,
  findCursorIndexFromLocal,
  getLayerDimensions,
} from '@/lib/layer-utils'
import { setTextCursorClickCallback } from '@/hooks/use-canvas-interactions'

interface InlineTextEditorProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  layerId: string
  viewport: Viewport
}

export function InlineTextEditor({ canvasRef, layerId, viewport }: InlineTextEditorProps) {
  const layer = useEditorStore((s) => {
    const found = findLayerById(s.layers, layerId)
    return found?.type === 'text' ? found : null
  })
  const updateTextProperties = useEditorStore((s) => s.updateTextProperties)
  const setEditingTextLayerId = useEditorStore((s) => s.setEditingTextLayerId)
  const pushSnapshot = useEditorStore((s) => s.pushSnapshot)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const committedRef = useRef(false)
  const snapshotPushedRef = useRef(false)
  const initialContent = useEditorStore((s) => {
    const found = findLayerById(s.layers, layerId)
    return found?.type === 'text' ? found.content : ''
  })
  const [cursorIndex, setCursorIndex] = useState(initialContent.length)
  const [selectionEnd, setSelectionEnd] = useState(initialContent.length)
  const [canvasRect, setCanvasRect] = useState<{ width: number; height: number } | null>(null)

  // Track canvas size
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    setCanvasRect({ width: rect.width, height: rect.height })
  }, [canvasRef, viewport])

  // Focus textarea and select all on mount
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta || !layer) return
    ta.value = layer.content
    ta.focus()
    ta.select()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Register click-to-cursor callback
  useEffect(() => {
    if (!layer) return
    const callback = (wx: number, wy: number) => {
      const { scaleX, scaleY, rotation } = layer.transform
      // Convert world coords to layer-local coords
      const dx = wx - layer.transform.x
      const dy = wy - layer.transform.y
      const rad = (-rotation * Math.PI) / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)
      const localX = (dx * cos - dy * sin) / scaleX
      const localY = (dx * sin + dy * cos) / scaleY

      const idx = findCursorIndexFromLocal(layer, localX, localY)
      setCursorIndex(idx)
      setSelectionEnd(idx)
      const ta = textareaRef.current
      if (ta) {
        ta.selectionStart = idx
        ta.selectionEnd = idx
        ta.focus()
      }
    }
    setTextCursorClickCallback(callback)
    return () => setTextCursorClickCallback(null)
  }, [layer])

  const commit = useCallback(() => {
    if (committedRef.current) return
    committedRef.current = true
    setEditingTextLayerId(null)
  }, [setEditingTextLayerId])

  const onBlur = useCallback(
    (e: React.FocusEvent) => {
      if (committedRef.current) return

      const related = e.relatedTarget as HTMLElement | null
      const canvas = canvasRef.current

      // If focus moved to a UI element outside the canvas, commit the edit
      if (related && canvas && !canvas.contains(related)) {
        commit()
        return
      }

      // Focus lost to canvas (pointer capture) — refocus via microtask
      queueMicrotask(() => {
        if (!committedRef.current) {
          textareaRef.current?.focus()
        }
      })
    },
    [canvasRef, commit],
  )

  const onInput = useCallback(() => {
    const ta = textareaRef.current
    if (!ta || !layer) return

    if (!snapshotPushedRef.current) {
      pushSnapshot()
      snapshotPushedRef.current = true
    }

    updateTextProperties(layerId, { content: ta.value })
    setCursorIndex(ta.selectionStart ?? 0)
    setSelectionEnd(ta.selectionEnd ?? ta.selectionStart ?? 0)
  }, [layer, layerId, updateTextProperties, pushSnapshot])

  const onSelect = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    setCursorIndex(ta.selectionStart ?? 0)
    setSelectionEnd(ta.selectionEnd ?? ta.selectionStart ?? 0)
  }, [])

  const removeLayer = useEditorStore((s) => s.removeLayer)
  const setActiveTool = useEditorStore((s) => s.setActiveTool)

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      e.stopPropagation()
      if (e.key === 'Escape') {
        const ta = textareaRef.current
        if (ta && ta.value === '') {
          committedRef.current = true
          setEditingTextLayerId(null)
          removeLayer(layerId)
          setActiveTool('pointer')
        } else {
          commit()
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault()
        const ta = textareaRef.current
        if (ta) {
          ta.selectionStart = 0
          ta.selectionEnd = ta.value.length
          setCursorIndex(0)
          setSelectionEnd(ta.value.length)
        }
      }
    },
    [commit, layerId, removeLayer, setActiveTool, setEditingTextLayerId],
  )

  // Compute caret screen position
  const caretStyle = useMemo((): React.CSSProperties | null => {
    if (!layer || !canvasRect) return null

    const pos = measureCursorPosition(layer, cursorIndex)

    const cx = canvasRect.width / 2 + viewport.panX
    const cy = canvasRect.height / 2 + viewport.panY
    const { x, y, scaleX, scaleY, rotation } = layer.transform
    const zoom = viewport.zoom

    // Scale local coords by layer scale and zoom to get screen-space offset
    const lx = pos.localX * scaleX * zoom
    const ly = pos.localY * scaleY * zoom

    const rad = (rotation * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)

    // Layer center in screen space
    const worldX = cx + x * zoom
    const worldY = cy + y * zoom

    // Rotate local offset to screen
    const screenX = worldX + lx * cos - ly * sin
    const screenY = worldY + lx * sin + ly * cos

    const caretH = layer.fontSize * Math.abs(scaleY) * zoom

    let color = '#ffffff'
    if (layer.fill.type === 'solid') color = layer.fill.color

    return {
      position: 'absolute',
      left: screenX,
      top: screenY,
      width: 2,
      height: caretH,
      backgroundColor: color,
      pointerEvents: 'none',
      animation: 'caret-blink 1s step-end infinite',
      transform: `rotate(${rotation}deg)`,
      transformOrigin: '0 0',
    }
  }, [layer, canvasRect, viewport, cursorIndex])

  const selectionHighlights = useMemo(() => {
    if (!layer || !canvasRect || cursorIndex === selectionEnd) return null

    const start = Math.min(cursorIndex, selectionEnd)
    const end = Math.max(cursorIndex, selectionEnd)

    const cx = canvasRect.width / 2 + viewport.panX
    const cy = canvasRect.height / 2 + viewport.panY
    const { x, y, scaleX, scaleY, rotation } = layer.transform
    const zoom = viewport.zoom
    const rad = (rotation * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const worldX = cx + x * zoom
    const worldY = cy + y * zoom
    const lineH = layer.fontSize * layer.lineHeight

    const rects: Array<{ x: number; y: number; w: number; h: number; rotation: number }> = []

    for (let i = start; i < end; ) {
      const startPos = measureCursorPosition(layer, i)
      // Find the end of the current line or selection end
      let lineEnd = i + 1
      while (lineEnd < end) {
        const nextPos = measureCursorPosition(layer, lineEnd)
        if (Math.abs(nextPos.localY - startPos.localY) > 1) break
        lineEnd++
      }
      const endPos = measureCursorPosition(layer, lineEnd)
      const sameLineEnd =
        Math.abs(endPos.localY - startPos.localY) < 1
          ? endPos
          : measureCursorPosition(layer, lineEnd - 1)

      const lx1 = startPos.localX * scaleX * zoom
      const ly1 = startPos.localY * scaleY * zoom
      const lx2 =
        (Math.abs(sameLineEnd.localY - startPos.localY) < 1
          ? sameLineEnd.localX
          : startPos.localX) *
        scaleX *
        zoom
      const ly2 = ly1 + lineH * scaleY * zoom

      const sx = worldX + lx1 * cos - ly1 * sin
      const sy = worldY + lx1 * sin + ly1 * cos
      const w = lx2 - lx1
      const h = ly2 - ly1

      rects.push({ x: sx, y: sy, w: Math.abs(w), h: Math.abs(h), rotation })
      i = lineEnd
    }

    return rects
  }, [layer, canvasRect, viewport, cursorIndex, selectionEnd])

  const boundingBox = useMemo(() => {
    if (!layer || !canvasRect) return null

    const dims = getLayerDimensions(layer)
    const { x, y, scaleX, scaleY, rotation } = layer.transform
    const zoom = viewport.zoom

    const cx = canvasRect.width / 2 + viewport.panX
    const cy = canvasRect.height / 2 + viewport.panY
    const worldX = cx + x * zoom
    const worldY = cy + y * zoom

    const hw = (dims.width * scaleX * zoom) / 2
    const hh = (dims.height * scaleY * zoom) / 2
    const rad = (rotation * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)

    const corners = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ].map(([px, py]) => ({
      x: worldX + px * cos - py * sin,
      y: worldY + px * sin + py * cos,
    }))

    return { corners, strokeWidth: 1.5 / zoom }
  }, [layer, canvasRect, viewport])

  if (!layer) return null

  return (
    <>
      {/* Hidden textarea captures keyboard input */}
      <textarea
        ref={textareaRef}
        onInput={onInput}
        onSelect={onSelect}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        spellCheck={false}
        style={{
          position: 'fixed',
          left: -9999,
          top: -9999,
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none',
        }}
      />
      {/* Textbox bounding box */}
      {boundingBox && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          <polygon
            points={boundingBox.corners.map((c) => `${c.x},${c.y}`).join(' ')}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={boundingBox.strokeWidth}
            strokeDasharray="6 3"
          />
        </svg>
      )}
      {/* Selection highlights */}
      {selectionHighlights && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {selectionHighlights.map((r, i) => (
            <rect
              key={i}
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              fill="#3b82f6"
              opacity={0.3}
              transform={`rotate(${r.rotation} ${r.x} ${r.y})`}
            />
          ))}
        </svg>
      )}
      {/* Blinking caret overlay */}
      {caretStyle && <div style={caretStyle} />}
    </>
  )
}
