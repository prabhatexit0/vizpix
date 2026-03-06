import type { StateCreator } from 'zustand'
import type { EditorState, ToolsSlice } from '../types'
import { findLayerById, removeLayerFromTree } from '@/lib/layer-utils'

function cleanupEmptyTextLayer(
  get: () => EditorState,
  set: (partial: Partial<EditorState>) => void,
) {
  const { editingTextLayerId, layers } = get()
  if (!editingTextLayerId) return
  const layer = findLayerById(layers, editingTextLayerId)
  if (layer?.type === 'text' && !layer.content) {
    set({ layers: removeLayerFromTree(layers, editingTextLayerId) })
  }
}

export const createToolsSlice: StateCreator<EditorState, [], [], ToolsSlice> = (set, get) => ({
  activeTool: 'pointer',
  activePanel: 'layers',
  editingTextLayerId: null,

  setActiveTool: (tool) => {
    cleanupEmptyTextLayer(get, set)
    set({ activeTool: tool, editingTextLayerId: null })
  },
  setActivePanel: (panel) => set({ activePanel: panel }),
  setEditingTextLayerId: (id) => {
    if (id === null) cleanupEmptyTextLayer(get, set)
    set({ editingTextLayerId: id })
  },
})
