import type { StateCreator } from 'zustand'
import type { EditorState, ViewportSlice } from '../types'
import { ZOOM_MIN, ZOOM_MAX } from '@/lib/constants'

const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))

export const createViewportSlice: StateCreator<EditorState, [], [], ViewportSlice> = (set) => ({
  viewport: { panX: 0, panY: 0, zoom: 1 },

  pan: (dx, dy) =>
    set((s) => ({
      viewport: {
        ...s.viewport,
        panX: s.viewport.panX + dx,
        panY: s.viewport.panY + dy,
      },
    })),

  zoom: (factor, centerX, centerY) =>
    set((s) => {
      const newZoom = clampZoom(s.viewport.zoom * factor)
      if (centerX !== undefined && centerY !== undefined) {
        const ratio = newZoom / s.viewport.zoom
        return {
          viewport: {
            zoom: newZoom,
            panX: centerX - (centerX - s.viewport.panX) * ratio,
            panY: centerY - (centerY - s.viewport.panY) * ratio,
          },
        }
      }
      return { viewport: { ...s.viewport, zoom: newZoom } }
    }),

  setZoom: (zoom) => set((s) => ({ viewport: { ...s.viewport, zoom: clampZoom(zoom) } })),

  resetViewport: () => set({ viewport: { panX: 0, panY: 0, zoom: 1 } }),

  fitToDocument: (canvasWidth, canvasHeight) =>
    set((s) => {
      const docW = s.documentWidth
      const docH = s.documentHeight
      const padding = 0.9 // 90% of available space
      const zoom = clampZoom(
        Math.min((canvasWidth * padding) / docW, (canvasHeight * padding) / docH),
      )
      return { viewport: { panX: 0, panY: 0, zoom } }
    }),
})
