import { useMemo, useCallback, useRef, useState } from 'react'
import { useEditorStore } from '@/store'
import type { TextLayer, FontWeight, Viewport } from '@/store/types'
import { measureCursorPosition } from '@/lib/layer-utils'
import { getFormattingAtSelection } from '@/lib/rich-text-utils'
import { Bold, Italic, Minus, Plus } from 'lucide-react'

interface TextFormatToolbarProps {
  layer: TextLayer
  viewport: Viewport
  canvasRect: { width: number; height: number }
  selectionStart: number
  selectionEnd: number
}

export function TextFormatToolbar({
  layer,
  viewport,
  canvasRect,
  selectionStart,
  selectionEnd,
}: TextFormatToolbarProps) {
  const applyTextFormatting = useEditorStore((s) => s.applyTextFormatting)
  const pushSnapshot = useEditorStore((s) => s.pushSnapshot)
  const colorInputRef = useRef<HTMLInputElement>(null)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)

  const start = Math.min(selectionStart, selectionEnd)
  const end = Math.max(selectionStart, selectionEnd)

  const formatting = useMemo(
    () => getFormattingAtSelection(layer.runs, start, end),
    [layer.runs, start, end],
  )

  const position = useMemo(() => {
    const pos = measureCursorPosition(layer, start)
    const cx = canvasRect.width / 2 + viewport.panX
    const cy = canvasRect.height / 2 + viewport.panY
    const { x, y, scaleX, scaleY, rotation } = layer.transform
    const zoom = viewport.zoom

    const lx = pos.localX * scaleX * zoom
    const ly = pos.localY * scaleY * zoom
    const rad = (rotation * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)

    const worldX = cx + x * zoom
    const worldY = cy + y * zoom

    const screenX = worldX + lx * cos - ly * sin
    const screenY = worldY + lx * sin + ly * cos

    return { x: screenX, y: screenY }
  }, [layer, start, canvasRect, viewport])

  const isBold = (formatting.fontWeight ?? layer.fontWeight) >= 700
  const isItalic = (formatting.fontStyle ?? layer.fontStyle) === 'italic'
  const currentSize = formatting.fontSize ?? layer.fontSize
  const currentColor = (() => {
    const fill = formatting.fill ?? layer.fill
    return fill.type === 'solid' ? fill.color : '#ffffff'
  })()

  const apply = useCallback(
    (props: Record<string, unknown>) => {
      pushSnapshot()
      applyTextFormatting(layer.id, props)
    },
    [pushSnapshot, applyTextFormatting, layer.id],
  )

  const toggleBold = useCallback(() => {
    apply({ fontWeight: (isBold ? 400 : 700) as FontWeight })
  }, [apply, isBold])

  const toggleItalic = useCallback(() => {
    apply({ fontStyle: isItalic ? 'normal' : 'italic' })
  }, [apply, isItalic])

  const adjustSize = useCallback(
    (delta: number) => {
      apply({ fontSize: Math.max(1, currentSize + delta) })
    },
    [apply, currentSize],
  )

  const onColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      apply({ fill: { type: 'solid' as const, color: e.target.value } })
    },
    [apply],
  )

  const prevent = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const toolbarY = position.y - 40
  const toolbarX = position.x

  return (
    <div
      className="pointer-events-auto absolute z-50 flex items-center gap-0.5 rounded-lg border border-white/12 bg-neutral-900 px-1 py-0.5 shadow-xl"
      style={{
        left: toolbarX,
        top: Math.max(4, toolbarY),
        transform: 'translateX(-50%)',
      }}
      onMouseDown={prevent}
    >
      <button
        className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${isBold ? 'bg-blue-500/30 text-blue-400' : 'text-neutral-300 hover:bg-white/10 hover:text-white'}`}
        onMouseDown={prevent}
        onClick={toggleBold}
        title="Bold (Ctrl+B)"
      >
        <Bold size={14} strokeWidth={2.5} />
      </button>
      <button
        className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${isItalic ? 'bg-blue-500/30 text-blue-400' : 'text-neutral-300 hover:bg-white/10 hover:text-white'}`}
        onMouseDown={prevent}
        onClick={toggleItalic}
        title="Italic (Ctrl+I)"
      >
        <Italic size={14} strokeWidth={2.5} />
      </button>

      <div className="mx-0.5 h-4 w-px bg-white/15" />

      <button
        className="flex h-7 w-7 items-center justify-center rounded text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
        onMouseDown={prevent}
        onClick={() => adjustSize(-2)}
        title="Decrease font size"
      >
        <Minus size={12} />
      </button>
      <span className="min-w-[28px] text-center text-[11px] text-neutral-400">{currentSize}</span>
      <button
        className="flex h-7 w-7 items-center justify-center rounded text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
        onMouseDown={prevent}
        onClick={() => adjustSize(2)}
        title="Increase font size"
      >
        <Plus size={12} />
      </button>

      <div className="mx-0.5 h-4 w-px bg-white/15" />

      <button
        className="flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-white/10"
        onMouseDown={prevent}
        onClick={() => {
          setColorPickerOpen(!colorPickerOpen)
          colorInputRef.current?.click()
        }}
        title="Text color"
      >
        <div
          className="h-4 w-4 rounded-sm border border-white/20"
          style={{ backgroundColor: currentColor }}
        />
      </button>
      <input
        ref={colorInputRef}
        type="color"
        value={currentColor}
        onChange={onColorChange}
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute h-0 w-0 opacity-0"
      />
    </div>
  )
}
