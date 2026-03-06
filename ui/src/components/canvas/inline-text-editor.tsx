import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useEditorStore } from '@/store'
import type { TextRun, Viewport } from '@/store/types'
import {
  findLayerById,
  measureCursorPosition,
  findCursorIndexFromLocal,
  getLayerDimensions,
  getSelectionRects,
  updateLayerInTree,
} from '@/lib/layer-utils'
import {
  getFormattingAtSelection,
  getPlainText,
  insertTextAtCursor,
  deleteTextAtRange,
} from '@/lib/rich-text-utils'
import { setTextCursorClickCallback } from '@/hooks/use-canvas-interactions'
import { TextFormatToolbar } from './text-format-toolbar'

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
  const setEditingTextLayerId = useEditorStore((s) => s.setEditingTextLayerId)
  const setTextSelection = useEditorStore((s) => s.setTextSelection)
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
  const [pendingFormat, setPendingFormat] = useState<Partial<Omit<TextRun, 'text'>> | null>(null)

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
    setTextSelection({ start: 0, end: layer.content.length })
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
      setTextSelection({ start: idx, end: idx })
      const ta = textareaRef.current
      if (ta) {
        ta.selectionStart = idx
        ta.selectionEnd = idx
        ta.focus()
      }
    }
    setTextCursorClickCallback(callback)
    return () => setTextCursorClickCallback(null)
  }, [layer, setTextSelection])

  const commit = useCallback(() => {
    if (committedRef.current) return
    committedRef.current = true
    setTextSelection(null)
    setEditingTextLayerId(null)
  }, [setEditingTextLayerId, setTextSelection])

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

    const newContent = ta.value
    const newCursor = ta.selectionStart ?? 0
    const oldContent = layer.content
    const oldRuns = layer.runs

    let newRuns: TextRun[]
    const sel = useEditorStore.getState().textSelection
    const hadSelection = sel && sel.start !== sel.end

    if (newContent === oldContent) {
      newRuns = oldRuns
    } else if (hadSelection) {
      // Selection was replaced (or deleted)
      const selStart = Math.min(sel.start, sel.end)
      const selEnd = Math.max(sel.start, sel.end)
      const deleted = deleteTextAtRange(oldRuns, selStart, selEnd)
      const insertedText = newContent.slice(selStart, newCursor)
      if (insertedText.length > 0) {
        newRuns = insertTextAtCursor(deleted, selStart, insertedText, pendingFormat)
      } else {
        newRuns = deleted
      }
      if (pendingFormat) setPendingFormat(null)
    } else if (newContent.length > oldContent.length) {
      // Text was inserted (no selection)
      const insertedLen = newContent.length - oldContent.length
      const insertPos = newCursor - insertedLen
      const insertedText = newContent.slice(insertPos, newCursor)
      newRuns = insertTextAtCursor(oldRuns, insertPos, insertedText, pendingFormat)
      if (pendingFormat) setPendingFormat(null)
    } else {
      // Text was deleted (backspace/delete, no selection)
      const deletedLen = oldContent.length - newContent.length
      const deleteStart = newCursor
      const deleteEnd = deleteStart + deletedLen
      newRuns = deleteTextAtRange(oldRuns, deleteStart, deleteEnd)
    }

    const { layers } = useEditorStore.getState()
    useEditorStore.setState({
      layers: updateLayerInTree(layers, layerId, (l) => {
        if (l.type !== 'text') return l
        return { ...l, runs: newRuns, content: getPlainText(newRuns) }
      }),
    })

    const start = ta.selectionStart ?? 0
    const end = ta.selectionEnd ?? start
    setCursorIndex(start)
    setSelectionEnd(end)
    setTextSelection({ start, end })
  }, [layer, layerId, pushSnapshot, setTextSelection, pendingFormat])

  const onSelect = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart ?? 0
    const end = ta.selectionEnd ?? start
    setCursorIndex(start)
    setSelectionEnd(end)
    setTextSelection({ start, end })
  }, [setTextSelection])

  const removeLayer = useEditorStore((s) => s.removeLayer)
  const setActiveTool = useEditorStore((s) => s.setActiveTool)
  const applyTextFormatting = useEditorStore((s) => s.applyTextFormatting)

  const toggleFormatting = useCallback(
    (prop: keyof Omit<TextRun, 'text'>, activeValue: unknown, inactiveValue: unknown) => {
      if (!layer) return
      const sel = useEditorStore.getState().textSelection
      if (!sel) return

      if (sel.start !== sel.end) {
        // Range selection: toggle based on current selection formatting
        const fmt = getFormattingAtSelection(layer.runs, sel.start, sel.end)
        const isActive = fmt[prop as keyof typeof fmt] === activeValue
        if (!snapshotPushedRef.current) {
          pushSnapshot()
          snapshotPushedRef.current = true
        }
        applyTextFormatting(layerId, {
          [prop]: isActive ? inactiveValue : activeValue,
        } as Partial<TextRun>)
      } else {
        // Point cursor: toggle pending format for next typed character
        setPendingFormat((prev) => {
          const current = prev ?? {}
          const currentVal = current[prop as keyof typeof current]
          if (currentVal === activeValue) {
            // Already pending active, switch to inactive
            const next = { ...current, [prop]: inactiveValue }
            return next
          }
          // Check the run at cursor to determine current state
          const fmt = getFormattingAtSelection(layer.runs, sel.start, sel.end)
          const runVal = fmt[prop as keyof typeof fmt]
          const resolvedCurrent = currentVal !== undefined ? currentVal : runVal
          return {
            ...current,
            [prop]: resolvedCurrent === activeValue ? inactiveValue : activeValue,
          }
        })
      }
    },
    [layer, layerId, applyTextFormatting, pushSnapshot],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      e.stopPropagation()
      if (e.key === 'Escape') {
        const ta = textareaRef.current
        if (ta && ta.value === '') {
          committedRef.current = true
          setTextSelection(null)
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
          setTextSelection({ start: 0, end: ta.value.length })
        }
      }
      // Text formatting shortcuts
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'b') {
          e.preventDefault()
          toggleFormatting('fontWeight', 700, 400)
        } else if (e.key === 'i') {
          e.preventDefault()
          toggleFormatting('fontStyle', 'italic', 'normal')
        } else if (e.key === 'u') {
          e.preventDefault()
          toggleFormatting('textDecoration', 'underline', 'none')
        }
      }
    },
    [
      commit,
      layerId,
      removeLayer,
      setActiveTool,
      setEditingTextLayerId,
      setTextSelection,
      toggleFormatting,
    ],
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

    const caretH = pos.fontSize * Math.abs(scaleY) * zoom

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

    const localRects = getSelectionRects(layer, start, end)
    if (localRects.length === 0) return null

    const cx = canvasRect.width / 2 + viewport.panX
    const cy = canvasRect.height / 2 + viewport.panY
    const { x, y, scaleX, scaleY, rotation } = layer.transform
    const zoom = viewport.zoom
    const rad = (rotation * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const worldX = cx + x * zoom
    const worldY = cy + y * zoom

    return localRects.map((r) => {
      const lx = r.localX * scaleX * zoom
      const ly = r.localY * scaleY * zoom
      const sx = worldX + lx * cos - ly * sin
      const sy = worldY + lx * sin + ly * cos
      const w = r.width * Math.abs(scaleX) * zoom
      const h = r.height * Math.abs(scaleY) * zoom
      return { x: sx, y: sy, w, h, rotation }
    })
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
      {/* Floating formatting toolbar */}
      {layer && canvasRect && cursorIndex !== selectionEnd && (
        <TextFormatToolbar
          layer={layer}
          viewport={viewport}
          canvasRect={canvasRect}
          selectionStart={cursorIndex}
          selectionEnd={selectionEnd}
        />
      )}
      {/* Blinking caret overlay */}
      {caretStyle && <div style={caretStyle} />}
    </>
  )
}
