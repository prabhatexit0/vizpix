import type { StateCreator } from 'zustand'
import type { EditorState, DocumentSlice } from '../types'

export const createDocumentSlice: StateCreator<EditorState, [], [], DocumentSlice> = (set) => ({
  documentWidth: 1920,
  documentHeight: 1080,
  documentBackground: '#ffffff',

  setDocumentSize: (width, height) => set({ documentWidth: width, documentHeight: height }),

  setDocumentBackground: (color) => set({ documentBackground: color }),

  swapDocumentDimensions: () =>
    set((s) => ({
      documentWidth: s.documentHeight,
      documentHeight: s.documentWidth,
    })),
})
