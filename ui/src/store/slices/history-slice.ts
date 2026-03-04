import type { StateCreator } from "zustand";
import type { EditorState, HistorySlice, LayerSnapshot } from "../types";
import { HISTORY_MAX } from "@/lib/constants";
import { decodeToBitmap, batchDecodeToBitmaps } from "@/lib/canvas-utils";

function snapshotLayers(layers: EditorState["layers"]): LayerSnapshot[] {
  return layers.map(({ imageBitmap: _, ...rest }) => ({
    ...rest,
    transform: { ...rest.transform },
  }));
}

async function restoreLayers(
  snapshots: LayerSnapshot[],
): Promise<EditorState["layers"]> {
  try {
    const bitmaps = await batchDecodeToBitmaps(snapshots.map((s) => s.imageBytes));
    return snapshots.map((snap, i) => ({
      ...snap,
      transform: { ...snap.transform },
      imageBitmap: bitmaps[i],
    }));
  } catch {
    return Promise.all(
      snapshots.map(async (snap) => ({
        ...snap,
        transform: { ...snap.transform },
        imageBitmap: await decodeToBitmap(snap.imageBytes),
      })),
    );
  }
}

export const createHistorySlice: StateCreator<EditorState, [], [], HistorySlice> = (
  set,
  get,
) => ({
  undoStack: [],
  redoStack: [],

  pushSnapshot: () => {
    const { layers, undoStack } = get();
    const snap = snapshotLayers(layers);
    const stack = [...undoStack, snap];
    if (stack.length > HISTORY_MAX) stack.shift();
    set({ undoStack: stack, redoStack: [] });
  },

  undo: async () => {
    const { undoStack, layers } = get();
    if (undoStack.length === 0) return;
    const stack = [...undoStack];
    const prev = stack.pop()!;
    const currentSnap = snapshotLayers(layers);
    const restored = await restoreLayers(prev);
    set((s) => ({
      undoStack: stack,
      redoStack: [...s.redoStack, currentSnap],
      layers: restored,
      activeLayerId:
        restored.find((l) => l.id === s.activeLayerId)
          ? s.activeLayerId
          : (restored[restored.length - 1]?.id ?? null),
    }));
  },

  redo: async () => {
    const { redoStack, layers } = get();
    if (redoStack.length === 0) return;
    const stack = [...redoStack];
    const next = stack.pop()!;
    const currentSnap = snapshotLayers(layers);
    const restored = await restoreLayers(next);
    set((s) => ({
      redoStack: stack,
      undoStack: [...s.undoStack, currentSnap],
      layers: restored,
      activeLayerId:
        restored.find((l) => l.id === s.activeLayerId)
          ? s.activeLayerId
          : (restored[restored.length - 1]?.id ?? null),
    }));
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,
});
