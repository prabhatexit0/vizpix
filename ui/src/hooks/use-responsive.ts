import { useSyncExternalStore } from 'react'
import { PHONE_BREAKPOINT, TABLET_BREAKPOINT } from '@/lib/constants'

function subscribe(cb: () => void) {
  const phoneMql = window.matchMedia(`(min-width: ${PHONE_BREAKPOINT}px)`)
  const tabletMql = window.matchMedia(`(min-width: ${TABLET_BREAKPOINT}px)`)
  phoneMql.addEventListener('change', cb)
  tabletMql.addEventListener('change', cb)
  return () => {
    phoneMql.removeEventListener('change', cb)
    tabletMql.removeEventListener('change', cb)
  }
}

type ResponsiveState = { isMobile: boolean; isTablet: boolean; isDesktop: boolean }

function getSnapshot(): ResponsiveState {
  const w = window.innerWidth
  return {
    isMobile: w < PHONE_BREAKPOINT,
    isTablet: w >= PHONE_BREAKPOINT && w < TABLET_BREAKPOINT,
    isDesktop: w >= TABLET_BREAKPOINT,
  }
}

const serverSnapshot: ResponsiveState = { isMobile: false, isTablet: false, isDesktop: true }

function getServerSnapshot(): ResponsiveState {
  return serverSnapshot
}

let cachedSnapshot: ResponsiveState | null = null
let cachedWidth = -1

function getStableSnapshot(): ResponsiveState {
  const w = window.innerWidth
  if (w !== cachedWidth) {
    cachedWidth = w
    cachedSnapshot = getSnapshot()
  }
  return cachedSnapshot!
}

export function useResponsive() {
  return useSyncExternalStore(subscribe, getStableSnapshot, getServerSnapshot)
}
