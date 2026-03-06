import type { StateCreator } from 'zustand'
import type { EditorState, ToolsSlice } from '../types'
import { findLayerById, removeLayerFromTree, updateLayerInTree } from '@/lib/layer-utils'
import { applyFormattingToSelection } from '@/lib/rich-text-utils'

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
  textSelection: null,
  showShortcuts: false,
  pendingDeleteLayerId: null,

  setActiveTool: (tool) => {
    cleanupEmptyTextLayer(get, set)
    set({ activeTool: tool, editingTextLayerId: null, textSelection: null })
  },
  setActivePanel: (panel) => set({ activePanel: panel }),
  setShowShortcuts: (show) => set({ showShortcuts: show }),
  setEditingTextLayerId: (id) => {
    if (id === null) cleanupEmptyTextLayer(get, set)
    set({ editingTextLayerId: id, textSelection: id === null ? null : get().textSelection })
  },
  setTextSelection: (sel) => set({ textSelection: sel }),
  applyTextFormatting: (layerId, props) => {
    const { textSelection, layers } = get()
    if (!textSelection) return
    const layer = findLayerById(layers, layerId)
    if (!layer || layer.type !== 'text') return

    const newRuns = applyFormattingToSelection(
      layer.runs,
      textSelection.start,
      textSelection.end,
      props,
    )
    set({
      layers: updateLayerInTree(layers, layerId, (l) => {
        if (l.type !== 'text') return l
        return { ...l, runs: newRuns }
      }),
    })
  },
  setPendingDeleteLayerId: (id) => set({ pendingDeleteLayerId: id }),
})
