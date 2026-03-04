import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useEditorStore } from '@/store'
import type { Viewport } from '@/store/types'
import { findLayerById, measureCursorPosition, findCursorIndexFromLocal } from '@/lib/layer-utils'
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

  // Re-focus the textarea if it loses focus while still editing
  // (e.g. pointer capture on canvas steals focus)
  const onBlur = useCallback(() => {
    if (committedRef.current) return
    requestAnimationFrame(() => {
      if (!committedRef.current) {
        textareaRef.current?.focus()
      }
    })
  }, [])

  const onInput = useCallback(() => {
    const ta = textareaRef.current
    if (!ta || !layer) return

    if (!snapshotPushedRef.current) {
      pushSnapshot()
      snapshotPushedRef.current = true
    }

    updateTextProperties(layerId, { content: ta.value })
    setCursorIndex(ta.selectionStart ?? 0)
  }, [layer, layerId, updateTextProperties, pushSnapshot])

  const onSelect = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    setCursorIndex(ta.selectionStart ?? 0)
  }, [])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      e.stopPropagation()
      if (e.key === 'Escape') {
        commit()
      }
    },
    [commit],
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
      {/* Blinking caret overlay */}
      {caretStyle && <div style={caretStyle} />}
    </>
  )
}
