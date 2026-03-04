import type { StateCreator } from 'zustand'
import type { EditorState, ToolsSlice } from '../types'

export const createToolsSlice: StateCreator<EditorState, [], [], ToolsSlice> = (set) => ({
  activeTool: 'pointer',
  activePanel: 'layers',

  setActiveTool: (tool) => set({ activeTool: tool }),
  setActivePanel: (panel) => set({ activePanel: panel }),
})
