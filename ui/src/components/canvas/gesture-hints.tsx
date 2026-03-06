import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useResponsive } from '@/hooks/use-responsive'

const STORAGE_KEY = 'vizpix-gestures-shown'

interface GestureHintsProps {
  forceShow?: boolean
  onClose?: () => void
}

const HINTS = [
  {
    label: 'Pinch to zoom',
    description: 'Use two fingers to zoom in and out',
    icon: PinchIcon,
  },
  {
    label: 'Two fingers to pan',
    description: 'Drag with two fingers to move the canvas',
    icon: PanIcon,
  },
  {
    label: 'Tap to select',
    description: 'Tap on a layer to select it',
    icon: TapIcon,
  },
  {
    label: 'Long press for options',
    description: 'Hold on a layer for more actions',
    icon: LongPressIcon,
  },
]

function shouldShowInitially(forceShow: boolean, isDesktop: boolean): boolean {
  if (isDesktop) return false
  if (forceShow) return true
  return !localStorage.getItem(STORAGE_KEY)
}

export function GestureHints({ forceShow = false, onClose }: GestureHintsProps) {
  const { isDesktop } = useResponsive()
  const [visible, setVisible] = useState(() => shouldShowInitially(forceShow, isDesktop))

  useEffect(() => {
    if (!visible || isDesktop || forceShow) return
    const timer = setTimeout(() => {
      setVisible(false)
      localStorage.setItem(STORAGE_KEY, '1')
    }, 5000)
    return () => clearTimeout(timer)
  }, [visible, isDesktop, forceShow])

  const dismiss = useCallback(() => {
    setVisible(false)
    localStorage.setItem(STORAGE_KEY, '1')
    onClose?.()
  }, [onClose])

  if (!visible || isDesktop) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={dismiss}
    >
      <div
        className="mx-6 max-w-sm rounded-2xl border border-white/15 bg-neutral-900/95 p-6 shadow-2xl backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Touch Gestures</h2>
          <button
            onClick={dismiss}
            className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {HINTS.map(({ label, description, icon: Icon }) => (
            <div key={label} className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/5">
                <Icon />
              </div>
              <div>
                <p className="text-sm font-medium text-white">{label}</p>
                <p className="text-xs text-neutral-400">{description}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={dismiss}
          className="mt-5 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

function PinchIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle
        cx="11"
        cy="16"
        r="3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        className="origin-center animate-[pinch_2s_ease-in-out_infinite] text-blue-400"
      />
      <circle
        cx="21"
        cy="16"
        r="3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        className="origin-center animate-[pinch_2s_ease-in-out_infinite] text-blue-400"
        style={{ animationDirection: 'reverse' }}
      />
      <path
        d="M14.5 16h3"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="2 2"
        className="text-neutral-500"
      />
    </svg>
  )
}

function PanIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle
        cx="12"
        cy="16"
        r="3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        className="animate-[panHand_2s_ease-in-out_infinite] text-blue-400"
      />
      <circle
        cx="20"
        cy="16"
        r="3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        className="animate-[panHand_2s_ease-in-out_infinite] text-blue-400"
      />
      <path
        d="M16 8v3M16 21v3M8 16h3M21 16h3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="text-neutral-500"
      />
    </svg>
  )
}

function TapIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle
        cx="16"
        cy="16"
        r="4"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-blue-400"
      />
      <circle
        cx="16"
        cy="16"
        r="8"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="3 3"
        className="origin-center animate-[tapRipple_1.5s_ease-out_infinite] text-blue-400/50"
      />
      <circle cx="16" cy="16" r="1.5" fill="currentColor" className="text-blue-400" />
    </svg>
  )
}

function LongPressIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle
        cx="16"
        cy="16"
        r="4"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-blue-400"
      />
      <circle cx="16" cy="16" r="1.5" fill="currentColor" className="text-blue-400" />
      <circle
        cx="16"
        cy="16"
        r="8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        className="animate-[longPress_2s_ease-in-out_infinite] text-blue-400/70"
        style={{ transformOrigin: '16px 16px', transform: 'rotate(-90deg)' }}
      />
    </svg>
  )
}
