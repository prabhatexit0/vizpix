import { useState, useEffect } from 'react'

export function useVirtualKeyboard() {
  const [keyboardHeight, setKeyboardHeight] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      // The difference between the full window height and the visual viewport
      // height tells us how much space the keyboard is taking up
      const kbHeight = window.innerHeight - vv.height
      // Use a threshold to avoid false positives from browser chrome changes
      setKeyboardHeight(kbHeight > 50 ? kbHeight : 0)
    }

    vv.addEventListener('resize', update)
    return () => vv.removeEventListener('resize', update)
  }, [])

  return keyboardHeight
}
