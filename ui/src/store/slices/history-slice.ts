import type { StateCreator } from 'zustand'
import type { EditorState, HistorySlice, LayerSnapshot, Layer } from '../types'
import { HISTORY_MAX } from '@/lib/constants'
import { decodeToBitmap, batchDecodeToBitmaps } from '@/lib/canvas-utils'

function snapshotMask(mask: Layer['mask']): Layer['mask'] {
  if (!mask) return mask
  return { ...mask, imageBitmap: null }
}

function snapshotLayer(layer: Layer): LayerSnapshot {
  const mask = snapshotMask(layer.mask)

  switch (layer.type) {
    case 'image': {
      return {
        ...layer,
        imageBitmap: undefined as never,
        transform: { ...layer.transform },
        mask,
      } as unknown as LayerSnapshot
    }
    case 'shape':
    case 'text':
      return { ...layer, transform: { ...layer.transform }, mask } as LayerSnapshot
    case 'group':
      return {
        ...layer,
        transform: { ...layer.transform },
        mask,
        children: layer.children.map(snapshotLayer),
      } as LayerSnapshot
  }
}

function snapshotLayers(layers: Layer[]): LayerSnapshot[] {
  return layers.map(snapshotLayer)
}

async function restoreLayer(snap: LayerSnapshot): Promise<Layer> {
  // Restore mask bitmap if present
  const mask = snap.mask
    ? {
        ...snap.mask,
        imageBitmap: await decodeToBitmap(snap.mask.imageBytes),
      }
    : snap.mask

  switch (snap.type) {
    case 'image': {
      const s = snap as Omit<Layer & { type: 'image' }, 'imageBitmap'>
      return {
        ...s,
        transform: { ...s.transform },
        imageBitmap: await decodeToBitmap(s.imageBytes),
        mask,
      }
    }
    case 'shape':
    case 'text':
      return { ...snap, transform: { ...snap.transform }, mask } as Layer
    case 'group': {
      const g = snap as LayerSnapshot & { type: 'group'; children: LayerSnapshot[] }
      return {
        ...g,
        transform: { ...g.transform },
        children: await Promise.all(g.children.map(restoreLayer)),
        mask,
      } as Layer
    }
  }
}

async function restoreLayers(snapshots: LayerSnapshot[]): Promise<Layer[]> {
  // Collect all image bytes that need bitmap decoding
  const imageLayers: { snap: LayerSnapshot; index: number }[] = []
  collectImageSnapshots(snapshots, imageLayers)

  if (imageLayers.length > 0) {
    try {
      const bitmaps = await batchDecodeToBitmaps(
        imageLayers.map((item) => (item.snap as { imageBytes: Uint8Array }).imageBytes),
      )
      // Create a map from snapshot to bitmap
      const bitmapMap = new Map<LayerSnapshot, ImageBitmap>()
      imageLayers.forEach((item, i) => bitmapMap.set(item.snap, bitmaps[i]))

      return Promise.all(snapshots.map((snap) => restoreLayerWithMap(snap, bitmapMap)))
    } catch {
      // Fallback to individual decode
    }
  }

  return Promise.all(snapshots.map(restoreLayer))
}

function collectImageSnapshots(
  snapshots: LayerSnapshot[],
  result: { snap: LayerSnapshot; index: number }[],
): void {
  for (const snap of snapshots) {
    if (snap.type === 'image') {
      result.push({ snap, index: result.length })
    } else if (snap.type === 'group') {
      const g = snap as { type: 'group'; children: LayerSnapshot[] }
      collectImageSnapshots(g.children, result)
    }
  }
}

async function restoreLayerWithMap(
  snap: LayerSnapshot,
  bitmapMap: Map<LayerSnapshot, ImageBitmap>,
): Promise<Layer> {
  const mask = snap.mask
    ? { ...snap.mask, imageBitmap: await decodeToBitmap(snap.mask.imageBytes) }
    : snap.mask

  switch (snap.type) {
    case 'image': {
      const s = snap as Omit<Layer & { type: 'image' }, 'imageBitmap'>
      const bitmap = bitmapMap.get(snap) ?? (await decodeToBitmap(s.imageBytes))
      return { ...s, transform: { ...s.transform }, imageBitmap: bitmap, mask }
    }
    case 'shape':
    case 'text':
      return { ...snap, transform: { ...snap.transform }, mask } as Layer
    case 'group': {
      const g = snap as LayerSnapshot & { type: 'group'; children: LayerSnapshot[] }
      return {
        ...g,
        transform: { ...g.transform },
        children: await Promise.all(g.children.map((c) => restoreLayerWithMap(c, bitmapMap))),
        mask,
      } as Layer
    }
  }
}

export const createHistorySlice: StateCreator<EditorState, [], [], HistorySlice> = (set, get) => ({
  undoStack: [],
  redoStack: [],

  pushSnapshot: () => {
    const { layers, undoStack } = get()
    const snap = snapshotLayers(layers)
    const stack = [...undoStack, snap]
    if (stack.length > HISTORY_MAX) stack.shift()
    set({ undoStack: stack, redoStack: [] })
  },

  undo: async () => {
    const { undoStack, layers } = get()
    if (undoStack.length === 0) return
    const stack = [...undoStack]
    const prev = stack.pop()!
    const currentSnap = snapshotLayers(layers)
    const restored = await restoreLayers(prev)
    set((s) => ({
      undoStack: stack,
      redoStack: [...s.redoStack, currentSnap],
      layers: restored,
      activeLayerId: findActiveId(restored, s.activeLayerId),
    }))
  },

  redo: async () => {
    const { redoStack, layers } = get()
    if (redoStack.length === 0) return
    const stack = [...redoStack]
    const next = stack.pop()!
    const currentSnap = snapshotLayers(layers)
    const restored = await restoreLayers(next)
    set((s) => ({
      redoStack: stack,
      undoStack: [...s.undoStack, currentSnap],
      layers: restored,
      activeLayerId: findActiveId(restored, s.activeLayerId),
    }))
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,
})

function findActiveId(layers: Layer[], currentId: string | null): string | null {
  if (!currentId) return layers[layers.length - 1]?.id ?? null
  if (findById(layers, currentId)) return currentId
  return layers[layers.length - 1]?.id ?? null
}

function findById(layers: Layer[], id: string): boolean {
  for (const l of layers) {
    if (l.id === id) return true
    if (l.type === 'group' && findById(l.children, id)) return true
  }
  return false
}
