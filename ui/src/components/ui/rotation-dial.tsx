import { useCallback, useRef } from 'react'

interface RotationDialProps {
  value: number
  onChange: (angle: number) => void
  onCommit?: () => void
}

export function RotationDial({ value, onChange, onCommit }: RotationDialProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const committedRef = useRef(false)

  const angleFromPointer = useCallback(
    (clientX: number, clientY: number, shiftKey: boolean) => {
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return value
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const rad = Math.atan2(clientY - cy, clientX - cx)
      let deg = ((rad * 180) / Math.PI + 90 + 360) % 360
      if (shiftKey) deg = Math.round(deg / 15) * 15
      return deg
    },
    [value],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      ;(e.target as SVGElement).setPointerCapture(e.pointerId)
      committedRef.current = false
      const angle = angleFromPointer(e.clientX, e.clientY, e.shiftKey)
      if (!committedRef.current) {
        onCommit?.()
        committedRef.current = true
      }
      onChange(angle)
    },
    [angleFromPointer, onChange, onCommit],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.buttons !== 1) return
      const angle = angleFromPointer(e.clientX, e.clientY, e.shiftKey)
      onChange(angle)
    },
    [angleFromPointer, onChange],
  )

  const rad = ((value - 90) * Math.PI) / 180
  const dotX = 16 + Math.cos(rad) * 11
  const dotY = 16 + Math.sin(rad) * 11

  return (
    <svg
      ref={svgRef}
      width={32}
      height={32}
      viewBox="0 0 32 32"
      className="shrink-0 cursor-pointer"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
    >
      <circle
        cx={16}
        cy={16}
        r={13}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className="text-white/15"
      />
      <line
        x1={16}
        y1={16}
        x2={dotX}
        y2={dotY}
        stroke="currentColor"
        strokeWidth={1}
        className="text-neutral-500"
      />
      <circle cx={dotX} cy={dotY} r={3} fill="currentColor" className="text-blue-500" />
    </svg>
  )
}
