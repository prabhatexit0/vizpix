import type { StateCreator } from 'zustand'
import type { EditorState, HistoryEntry, HistorySlice, LayerSnapshot, Layer } from '../types'
import { HISTORY_MAX } from '@/lib/constants'
import { decodeToBitmap, batchDecodeToBitmaps } from '@/lib/canvas-utils'

const MIN_HISTORY = 5

function snapshotMask(mask: Layer['mask']): Layer['mask'] {
  if (!mask) return mask
  return { ...mask, imageBitmap: null }
}

function snapshotLayer(layer: Layer): LayerSnapshot {
  const mask = snapshotMask(layer.mask)

  switch (layer.type) {
    case 'image': {
      return {
        id: layer.id,
        type: layer.type,
        name: layer.name,
        visible: layer.visible,
        opacity: layer.opacity,
        blendMode: layer.blendMode,
        locked: layer.locked,
        imageBytes: layer.imageBytes,
        width: layer.width,
        height: layer.height,
        transform: { ...layer.transform },
        mask,
      } as LayerSnapshot
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

function snapshotLayersWithDelta(
  layers: Layer[],
  prevSnapshots: LayerSnapshot[] | null,
): LayerSnapshot[] {
  if (!prevSnapshots) return snapshotLayers(layers)

  const prevMap = new Map<string, LayerSnapshot>()
  buildSnapshotMap(prevSnapshots, prevMap)

  return layers.map((layer) => {
    const prev = prevMap.get(layer.id)
    if (prev && layer.type === 'image' && prev.type === 'image') {
      const prevImg = prev as { imageBytes: Uint8Array }
      if (Object.is(layer.imageBytes, prevImg.imageBytes)) {
        return prev
      }
    }
    return snapshotLayer(layer)
  })
}

function buildSnapshotMap(snapshots: LayerSnapshot[], map: Map<string, LayerSnapshot>): void {
  for (const snap of snapshots) {
    map.set(snap.id, snap)
    if (snap.type === 'group') {
      const g = snap as { children: LayerSnapshot[] }
      buildSnapshotMap(g.children, map)
    }
  }
}

function estimateUniqueMemory(stacks: HistoryEntry[][]): number {
  const seen = new Set<Uint8Array>()
  for (const stack of stacks) {
    for (const entry of stack) {
      collectUniqueBytes(entry.layers, seen)
    }
  }
  let total = 0
  for (const bytes of seen) {
    total += bytes.byteLength
  }
  return total
}

function collectUniqueBytes(snapshots: LayerSnapshot[], seen: Set<Uint8Array>): void {
  for (const snap of snapshots) {
    if (snap.type === 'image') {
      const img = snap as { imageBytes: Uint8Array }
      seen.add(img.imageBytes)
    } else if (snap.type === 'group') {
      const g = snap as { children: LayerSnapshot[] }
      collectUniqueBytes(g.children, seen)
    }
    if (snap.mask) {
      seen.add(snap.mask.imageBytes)
    }
  }
}

async function restoreLayer(snap: LayerSnapshot, origMap: Map<string, Uint8Array>): Promise<Layer> {
  // Restore mask bitmap if present
  const mask = snap.mask
    ? {
        ...snap.mask,
        imageBitmap: await decodeToBitmap(snap.mask.imageBytes),
      }
    : snap.mask

  switch (snap.type) {
    case 'image': {
      const s = snap as Omit<Layer & { type: 'image' }, 'imageBitmap' | 'originalBytes'>
      return {
        ...s,
        transform: { ...s.transform },
        imageBitmap: await decodeToBitmap(s.imageBytes),
        originalBytes: origMap.get(s.id) ?? s.imageBytes,
        mask,
      } as Layer
    }
    case 'shape':
    case 'text':
      return { ...snap, transform: { ...snap.transform }, mask } as Layer
    case 'group': {
      const g = snap as LayerSnapshot & { type: 'group'; children: LayerSnapshot[] }
      return {
        ...g,
        transform: { ...g.transform },
        children: await Promise.all(g.children.map((c) => restoreLayer(c, origMap))),
        mask,
      } as Layer
    }
  }
}

function buildOriginalBytesMap(layers: Layer[]): Map<string, Uint8Array> {
  const map = new Map<string, Uint8Array>()
  for (const l of layers) {
    if (l.type === 'image') map.set(l.id, l.originalBytes)
    else if (l.type === 'group') {
      for (const [k, v] of buildOriginalBytesMap(l.children)) map.set(k, v)
    }
  }
  return map
}

async function restoreLayers(snapshots: LayerSnapshot[], currentLayers: Layer[]): Promise<Layer[]> {
  const origMap = buildOriginalBytesMap(currentLayers)

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

      return Promise.all(snapshots.map((snap) => restoreLayerWithMap(snap, bitmapMap, origMap)))
    } catch {
      // Fallback to individual decode
    }
  }

  return Promise.all(snapshots.map((snap) => restoreLayer(snap, origMap)))
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
  origMap: Map<string, Uint8Array>,
): Promise<Layer> {
  const mask = snap.mask
    ? { ...snap.mask, imageBitmap: await decodeToBitmap(snap.mask.imageBytes) }
    : snap.mask

  switch (snap.type) {
    case 'image': {
      const s = snap as Omit<Layer & { type: 'image' }, 'imageBitmap' | 'originalBytes'>
      const bitmap = bitmapMap.get(snap) ?? (await decodeToBitmap(s.imageBytes))
      return {
        ...s,
        transform: { ...s.transform },
        imageBitmap: bitmap,
        originalBytes: origMap.get(s.id) ?? s.imageBytes,
        mask,
      } as Layer
    }
    case 'shape':
    case 'text':
      return { ...snap, transform: { ...snap.transform }, mask } as Layer
    case 'group': {
      const g = snap as LayerSnapshot & { type: 'group'; children: LayerSnapshot[] }
      return {
        ...g,
        transform: { ...g.transform },
        children: await Promise.all(
          g.children.map((c) => restoreLayerWithMap(c, bitmapMap, origMap)),
        ),
        mask,
      } as Layer
    }
  }
}

export const createHistorySlice: StateCreator<EditorState, [], [], HistorySlice> = (set, get) => ({
  undoStack: [],
  redoStack: [],

  pushSnapshot: () => {
    const { layers, activeLayerId, undoStack, redoStack } = get()
    const prevEntry = undoStack.length > 0 ? undoStack[undoStack.length - 1] : null
    const snap = snapshotLayersWithDelta(layers, prevEntry?.layers ?? null)
    const entry: HistoryEntry = { layers: snap, activeLayerId }
    const stack = [...undoStack, entry]

    const memoryBytes = estimateUniqueMemory([stack, redoStack])
    const memoryMB = memoryBytes / (1024 * 1024)
    let effectiveMax = HISTORY_MAX
    if (memoryMB > 500) {
      effectiveMax = Math.max(MIN_HISTORY, Math.floor((HISTORY_MAX * 500) / memoryMB))
    }

    let trimmed = false
    while (stack.length > effectiveMax) {
      stack.shift()
      trimmed = true
    }
    if (trimmed && memoryMB > 500) {
      console.warn(
        `History trimmed: estimated ${memoryMB.toFixed(0)}MB exceeds 500MB limit (max entries reduced to ${effectiveMax})`,
      )
    }

    set({ undoStack: stack, redoStack: [] })
  },

  undo: async () => {
    const { undoStack, layers, activeLayerId } = get()
    if (undoStack.length === 0) return
    const stack = [...undoStack]
    const prevEntry = stack.pop()!
    const currentEntry: HistoryEntry = { layers: snapshotLayers(layers), activeLayerId }
    const restored = await restoreLayers(prevEntry.layers, layers)
    const restoredActiveId = findActiveId(restored, prevEntry.activeLayerId)
    set((s) => ({
      undoStack: stack,
      redoStack: [...s.redoStack, currentEntry],
      layers: restored,
      activeLayerId: restoredActiveId,
    }))
  },

  redo: async () => {
    const { redoStack, layers, activeLayerId } = get()
    if (redoStack.length === 0) return
    const stack = [...redoStack]
    const nextEntry = stack.pop()!
    const currentEntry: HistoryEntry = { layers: snapshotLayers(layers), activeLayerId }
    const restored = await restoreLayers(nextEntry.layers, layers)
    const restoredActiveId = findActiveId(restored, nextEntry.activeLayerId)
    set((s) => ({
      redoStack: stack,
      undoStack: [...s.undoStack, currentEntry],
      layers: restored,
      activeLayerId: restoredActiveId,
    }))
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,
})

function findActiveId(layers: Layer[], snapshotActiveId: string | null): string | null {
  if (!snapshotActiveId) return null
  if (findById(layers, snapshotActiveId)) return snapshotActiveId
  return layers.length > 0 ? layers[layers.length - 1].id : null
}

function findById(layers: Layer[], id: string): boolean {
  for (const l of layers) {
    if (l.id === id) return true
    if (l.type === 'group' && findById(l.children, id)) return true
  }
  return false
}
