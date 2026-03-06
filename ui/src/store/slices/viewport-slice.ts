import type { StateCreator } from 'zustand'
import type { EditorState, ViewportSlice } from '../types'
import { ZOOM_MIN, ZOOM_MAX } from '@/lib/constants'

const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))

const LERP_SPEED = 0.25
const SNAP_THRESHOLD = 0.0005

export const createViewportSlice: StateCreator<EditorState, [], [], ViewportSlice> = (
  set,
  get,
) => ({
  viewport: { panX: 0, panY: 0, zoom: 1 },
  viewportTarget: null,

  pan: (dx, dy) =>
    set((s) => ({
      viewport: {
        ...s.viewport,
        panX: s.viewport.panX + dx,
        panY: s.viewport.panY + dy,
      },
      viewportTarget: s.viewportTarget
        ? {
            ...s.viewportTarget,
            panX: s.viewportTarget.panX + dx,
            panY: s.viewportTarget.panY + dy,
          }
        : null,
    })),

  zoom: (factor, centerX, centerY) =>
    set((s) => {
      const base = s.viewportTarget ?? s.viewport
      const newZoom = clampZoom(base.zoom * factor)
      if (centerX !== undefined && centerY !== undefined) {
        const ratio = newZoom / base.zoom
        return {
          viewportTarget: {
            zoom: newZoom,
            panX: centerX - (centerX - base.panX) * ratio,
            panY: centerY - (centerY - base.panY) * ratio,
          },
        }
      }
      return { viewportTarget: { ...base, zoom: newZoom } }
    }),

  setZoom: (zoom) =>
    set((s) => {
      const base = s.viewportTarget ?? s.viewport
      return { viewportTarget: { ...base, zoom: clampZoom(zoom) } }
    }),

  resetViewport: () => set({ viewport: { panX: 0, panY: 0, zoom: 1 }, viewportTarget: null }),

  fitToDocument: (canvasWidth, canvasHeight) =>
    set((s) => {
      const docW = s.documentWidth
      const docH = s.documentHeight
      const padding = 0.9
      const zoom = clampZoom(
        Math.min((canvasWidth * padding) / docW, (canvasHeight * padding) / docH),
      )
      return { viewportTarget: { panX: 0, panY: 0, zoom } }
    }),

  tickViewportAnimation: () => {
    const { viewport, viewportTarget } = get()
    if (!viewportTarget) return false

    const dz = viewportTarget.zoom - viewport.zoom
    const dpx = viewportTarget.panX - viewport.panX
    const dpy = viewportTarget.panY - viewport.panY

    const done = Math.abs(dz) < SNAP_THRESHOLD && Math.abs(dpx) < 0.5 && Math.abs(dpy) < 0.5

    if (done) {
      set({ viewport: { ...viewportTarget }, viewportTarget: null })
      return false
    }

    set({
      viewport: {
        zoom: viewport.zoom + dz * LERP_SPEED,
        panX: viewport.panX + dpx * LERP_SPEED,
        panY: viewport.panY + dpy * LERP_SPEED,
      },
    })
    return true
  },
})
