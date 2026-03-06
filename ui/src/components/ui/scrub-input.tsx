import { useCallback, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useResponsive } from '@/hooks/use-responsive'

interface ScrubInputProps {
  label: string
  value: number
  onChange: (value: number) => void
  onCommit?: (value: number) => void
  min?: number
  max?: number
  step?: number
  precision?: number
  suffix?: string
}

export function ScrubInput({
  label,
  value,
  onChange,
  onCommit,
  min,
  max,
  step = 1,
  precision = 0,
  suffix,
}: ScrubInputProps) {
  const { isDesktop } = useResponsive()
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const startValueRef = useRef(value)
  const startXRef = useRef(0)
  const committedRef = useRef(false)

  const clamp = useCallback(
    (v: number) => {
      let clamped = v
      if (min !== undefined) clamped = Math.max(min, clamped)
      if (max !== undefined) clamped = Math.min(max, clamped)
      return Number(clamped.toFixed(precision))
    },
    [min, max, precision],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      setIsScrubbing(true)
      startXRef.current = e.clientX
      startValueRef.current = value
      committedRef.current = false
    },
    [value],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isScrubbing) return
      const dx = e.clientX - startXRef.current
      let sensitivity = 1
      if (e.shiftKey) sensitivity = 10
      else if (e.altKey) sensitivity = 0.1
      const newValue = clamp(startValueRef.current + dx * step * sensitivity)
      if (!committedRef.current) {
        onCommit?.(startValueRef.current)
        committedRef.current = true
      }
      onChange(newValue)
    },
    [isScrubbing, step, clamp, onChange, onCommit],
  )

  const handlePointerUp = useCallback(() => {
    setIsScrubbing(false)
  }, [])

  const handleInputFocus = useCallback(() => {
    setIsEditing(true)
    setEditValue(value.toFixed(precision))
    requestAnimationFrame(() => {
      inputRef.current?.select()
    })
  }, [value, precision])

  const commitEdit = useCallback(
    (revert: boolean) => {
      setIsEditing(false)
      if (revert) return
      const n = Number(editValue)
      if (Number.isNaN(n)) return
      const clamped = clamp(n)
      onCommit?.(value)
      onChange(clamped)
    },
    [editValue, clamp, onChange, onCommit, value],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        commitEdit(false)
        inputRef.current?.blur()
      } else if (e.key === 'Escape') {
        commitEdit(true)
        inputRef.current?.blur()
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        const multiplier = e.shiftKey ? 10 : 1
        const delta = e.key === 'ArrowUp' ? step * multiplier : -step * multiplier
        const newValue = clamp(value + delta)
        onCommit?.(value)
        onChange(newValue)
      }
    },
    [commitEdit, step, clamp, value, onChange, onCommit],
  )

  const displayValue = isEditing ? editValue : value.toFixed(precision)

  return (
    <div className="flex items-center gap-1.5">
      <label
        className={cn(
          'shrink-0 cursor-ew-resize text-xs tracking-wide uppercase select-none',
          isScrubbing ? 'text-blue-400' : 'text-neutral-500',
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {label}
      </label>
      <div className="relative flex-1">
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={displayValue}
          onFocus={handleInputFocus}
          onBlur={() => commitEdit(false)}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className={cn(
            'border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full min-w-0 rounded-md border bg-transparent px-2 text-xs text-neutral-200 transition-[color,box-shadow] outline-none focus-visible:ring-[3px]',
            !isDesktop ? 'h-11' : 'h-7',
          )}
        />
        {suffix && !isEditing && (
          <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] text-neutral-500">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}
