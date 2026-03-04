import type { StateCreator } from 'zustand'
import type { EditorState, ToolsSlice } from '../types'

export const createToolsSlice: StateCreator<EditorState, [], [], ToolsSlice> = (set) => ({
  activeTool: 'pointer',
  activePanel: 'layers',
  editingTextLayerId: null,

  setActiveTool: (tool) => set({ activeTool: tool, editingTextLayerId: null }),
  setActivePanel: (panel) => set({ activePanel: panel }),
  setEditingTextLayerId: (id) => set({ editingTextLayerId: id }),
})
