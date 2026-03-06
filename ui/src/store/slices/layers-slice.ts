import type { StateCreator } from 'zustand'
import type {
  EditorState,
  LayersSlice,
  ShapeType,
  ShapeLayer,
  TextLayer,
  GroupLayer,
  Layer,
} from '../types'
import { createLayer, resetLayerCounter } from '@/lib/layer-factory'
import { decodeToBitmap } from '@/lib/canvas-utils'
import { invalidateAlphaCache } from '@/lib/hit-test-cache'
import {
  findLayerById,
  updateLayerInTree,
  removeLayerFromTree,
  findLayerParent,
} from '@/lib/layer-utils'

function isLightColor(hex: string): boolean {
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  // Relative luminance
  return 0.299 * r + 0.587 * g + 0.114 * b > 128
}

let shapeCounter = 0
let textCounter = 0
let groupCounter = 0

export const createLayersSlice: StateCreator<EditorState, [], [], LayersSlice> = (set, get) => ({
  layers: [],
  activeLayerId: null,

  addLayer: async (bytes, name) => {
    const { documentWidth, documentHeight } = get()
    const layer = await createLayer(bytes, name, documentWidth * 2, documentHeight * 2)
    get().pushSnapshot()
    set((s) => ({
      layers: [...s.layers, layer],
      activeLayerId: layer.id,
    }))
  },

  removeLayer: (id) => {
    invalidateAlphaCache(id)
    get().pushSnapshot()
    set((s) => {
      const layers = removeLayerFromTree(s.layers, id)
      const activeLayerId =
        s.activeLayerId === id ? (layers[layers.length - 1]?.id ?? null) : s.activeLayerId
      return { layers, activeLayerId }
    })
  },

  setActiveLayer: (id) => set({ activeLayerId: id }),

  toggleVisibility: (id) => {
    set((s) => ({
      layers: updateLayerInTree(s.layers, id, (l) => ({ ...l, visible: !l.visible })),
    }))
  },

  setOpacity: (id, opacity) => {
    set((s) => ({
      layers: updateLayerInTree(s.layers, id, (l) => ({ ...l, opacity })),
    }))
  },

  setBlendMode: (id, blendMode) => {
    set((s) => ({
      layers: updateLayerInTree(s.layers, id, (l) => ({ ...l, blendMode })),
    }))
  },

  setTransform: (id, partial) => {
    set((s) => ({
      layers: updateLayerInTree(s.layers, id, (l) => ({
        ...l,
        transform: { ...l.transform, ...partial },
      })),
    }))
  },

  reorderLayers: (fromIndex, toIndex) => {
    get().pushSnapshot()
    set((s) => {
      const layers = [...s.layers]
      const [moved] = layers.splice(fromIndex, 1)
      layers.splice(toIndex, 0, moved)
      return { layers }
    })
  },

  renameLayer: (id, name) => {
    set((s) => ({
      layers: updateLayerInTree(s.layers, id, (l) => ({ ...l, name })),
    }))
  },

  duplicateLayer: (id) => {
    get().pushSnapshot()
    set((s) => {
      const source = findLayerById(s.layers, id)
      if (!source) return s
      const dup = deepCloneLayer(source)
      dup.name = `${source.name} copy`
      dup.transform = {
        ...source.transform,
        x: source.transform.x + 20,
        y: source.transform.y + 20,
      }

      const parentInfo = findLayerParent(s.layers, id)
      if (!parentInfo) return s
      const newParent = [...parentInfo.parent]
      newParent.splice(parentInfo.index + 1, 0, dup)

      if (parentInfo.parent === s.layers) {
        return { layers: newParent, activeLayerId: dup.id }
      }
      const layers = rebuildTreeWithParent(s.layers, parentInfo.parent, newParent)
      return { layers, activeLayerId: dup.id }
    })
  },

  toggleLock: (id) => {
    set((s) => ({
      layers: updateLayerInTree(s.layers, id, (l) => ({ ...l, locked: !l.locked })),
    }))
  },

  loadDocument: ({ layers, activeLayerId, documentWidth, documentHeight, documentBackground }) => {
    resetLayerCounter(layers.length)
    shapeCounter = 0
    textCounter = 0
    groupCounter = 0
    set({
      layers,
      activeLayerId,
      documentWidth,
      documentHeight,
      documentBackground,
      undoStack: [],
      redoStack: [],
    })
  },

  applyWasmToLayer: async (id, processedBytes) => {
    get().pushSnapshot()
    const bitmap = await decodeToBitmap(processedBytes)
    set((s) => ({
      layers: updateLayerInTree(s.layers, id, (l) => {
        if (l.type !== 'image') return l
        return {
          ...l,
          imageBytes: processedBytes,
          imageBitmap: bitmap,
          width: bitmap.width,
          height: bitmap.height,
        }
      }),
    }))
  },

  // --- Shape layers ---

  addShapeLayer: (shapeType: ShapeType, rect?) => {
    shapeCounter++
    const labels: Record<ShapeType, string> = {
      rectangle: 'Rectangle',
      ellipse: 'Ellipse',
      line: 'Line',
      polygon: 'Polygon',
    }
    const w = rect ? Math.abs(rect.width) : 200
    const h = rect ? Math.abs(rect.height) : shapeType === 'line' ? 0 : 200
    const layer: ShapeLayer = {
      id: crypto.randomUUID(),
      type: 'shape',
      name: `${labels[shapeType]} ${shapeCounter}`,
      shapeType,
      width: w,
      height: h,
      fill: { type: 'solid', color: '#3b82f6' },
      stroke: { color: '#000000', width: 0, alignment: 'center' },
      cornerRadius: 0,
      points: [],
      visible: true,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: rect?.x ?? 0, y: rect?.y ?? 0, scaleX: 1, scaleY: 1, rotation: 0 },
      locked: false,
    }
    get().pushSnapshot()
    set((s) => ({
      layers: [...s.layers, layer],
      activeLayerId: layer.id,
    }))
  },

  updateShapeProperties: (id, props) => {
    set((s) => ({
      layers: updateLayerInTree(s.layers, id, (l) => {
        if (l.type !== 'shape') return l
        return { ...l, ...props }
      }),
    }))
  },

  // --- Text layers ---

  addTextLayer: (rect?) => {
    textCounter++
    const bg = get().documentBackground
    const textColor = isLightColor(bg) ? '#000000' : '#ffffff'
    const layer: TextLayer = {
      id: crypto.randomUUID(),
      type: 'text',
      name: `Text ${textCounter}`,
      content: 'Text',
      fontFamily: 'Inter',
      fontSize: 24,
      fontWeight: 400,
      fontStyle: 'normal',
      fill: { type: 'solid', color: textColor },
      textAlign: 'left',
      lineHeight: 1.4,
      letterSpacing: 0,
      maxWidth: rect && rect.width > 0 ? Math.abs(rect.width) : null,
      visible: true,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: rect?.x ?? 0, y: rect?.y ?? 0, scaleX: 1, scaleY: 1, rotation: 0 },
      locked: false,
    }
    get().pushSnapshot()
    const layerId = layer.id
    set((s) => ({
      layers: [...s.layers, layer],
      activeLayerId: layerId,
      editingTextLayerId: layerId,
    }))
  },

  updateTextProperties: (id, props) => {
    set((s) => ({
      layers: updateLayerInTree(s.layers, id, (l) => {
        if (l.type !== 'text') return l
        return { ...l, ...props }
      }),
    }))
  },

  // --- Groups ---

  groupLayers: (layerIds) => {
    if (layerIds.length < 2) return
    get().pushSnapshot()
    groupCounter++
    set((s) => {
      const children: Layer[] = []
      const remaining: Layer[] = []
      let insertIndex = -1

      for (let i = 0; i < s.layers.length; i++) {
        if (layerIds.includes(s.layers[i].id)) {
          children.push(s.layers[i])
          if (insertIndex === -1) insertIndex = remaining.length
        } else {
          remaining.push(s.layers[i])
        }
      }

      if (children.length === 0) return s

      const group: GroupLayer = {
        id: crypto.randomUUID(),
        type: 'group',
        name: `Group ${groupCounter}`,
        children,
        expanded: true,
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        locked: false,
      }

      remaining.splice(insertIndex, 0, group)
      return { layers: remaining, activeLayerId: group.id }
    })
  },

  ungroupLayer: (groupId) => {
    get().pushSnapshot()
    set((s) => {
      const parentInfo = findLayerParent(s.layers, groupId)
      if (!parentInfo) return s
      const group = parentInfo.parent[parentInfo.index]
      if (group.type !== 'group') return s

      const newParent = [...parentInfo.parent]
      newParent.splice(parentInfo.index, 1, ...group.children)

      if (parentInfo.parent === s.layers) {
        return { layers: newParent }
      }
      return { layers: rebuildTreeWithParent(s.layers, parentInfo.parent, newParent) }
    })
  },

  moveLayerToGroup: (layerId, groupId, index) => {
    get().pushSnapshot()
    set((s) => {
      const layer = findLayerById(s.layers, layerId)
      if (!layer) return s
      let layers = removeLayerFromTree(s.layers, layerId)
      layers = updateLayerInTree(layers, groupId, (g) => {
        if (g.type !== 'group') return g
        const children = [...g.children]
        children.splice(index, 0, layer)
        return { ...g, children }
      })
      return { layers }
    })
  },

  moveLayerOutOfGroup: (layerId) => {
    get().pushSnapshot()
    set((s) => {
      const layer = findLayerById(s.layers, layerId)
      if (!layer) return s

      const groupParent = findGroupContaining(s.layers, layerId)
      if (!groupParent) return s

      let layers = removeLayerFromTree(s.layers, layerId)

      const topInfo = findLayerParent(layers, groupParent.id)
      if (!topInfo) {
        layers = [...layers, layer]
      } else {
        const newParent = [...topInfo.parent]
        newParent.splice(topInfo.index + 1, 0, layer)
        if (topInfo.parent === layers) {
          layers = newParent
        } else {
          layers = rebuildTreeWithParent(layers, topInfo.parent, newParent)
        }
      }
      return { layers }
    })
  },

  // --- Masks ---

  setLayerMask: async (layerId, maskBytes) => {
    get().pushSnapshot()
    const bitmap = await decodeToBitmap(maskBytes)
    set((s) => ({
      layers: updateLayerInTree(s.layers, layerId, (l) => ({
        ...l,
        mask: {
          imageBytes: maskBytes,
          imageBitmap: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          inverted: false,
        },
      })),
    }))
  },

  removeLayerMask: (layerId) => {
    get().pushSnapshot()
    set((s) => ({
      layers: updateLayerInTree(s.layers, layerId, (l) => ({
        ...l,
        mask: null,
      })),
    }))
  },

  invertLayerMask: (layerId) => {
    set((s) => ({
      layers: updateLayerInTree(s.layers, layerId, (l) => {
        if (!l.mask) return l
        return { ...l, mask: { ...l.mask, inverted: !l.mask.inverted } }
      }),
    }))
  },
})

function deepCloneLayer(layer: Layer): Layer {
  const base = {
    ...layer,
    id: crypto.randomUUID(),
    transform: { ...layer.transform },
    mask: layer.mask ? { ...layer.mask } : undefined,
  }

  if (layer.type === 'group') {
    return {
      ...base,
      type: 'group',
      children: layer.children.map(deepCloneLayer),
    } as GroupLayer
  }

  if (layer.type === 'shape') {
    return {
      ...base,
      type: 'shape',
      fill: { ...layer.fill } as ShapeLayer['fill'],
      stroke: { ...layer.stroke },
      points: layer.points.map((p) => ({ ...p })),
    } as ShapeLayer
  }

  return base as Layer
}

function rebuildTreeWithParent(layers: Layer[], oldParent: Layer[], newParent: Layer[]): Layer[] {
  return layers.map((l) => {
    if (l.type === 'group') {
      if (l.children === oldParent) return { ...l, children: newParent }
      const rebuilt = rebuildTreeWithParent(l.children, oldParent, newParent)
      if (rebuilt !== l.children) return { ...l, children: rebuilt }
    }
    return l
  })
}

function findGroupContaining(layers: Layer[], childId: string): GroupLayer | null {
  for (const layer of layers) {
    if (layer.type === 'group') {
      if (layer.children.some((c) => c.id === childId)) return layer
      const found = findGroupContaining(layer.children, childId)
      if (found) return found
    }
  }
  return null
}
