import type { StateCreator } from "zustand";
import type { EditorState, LayersSlice } from "../types";
import { createLayer } from "@/lib/layer-factory";
import { decodeToBitmap } from "@/lib/canvas-utils";
import { invalidateAlphaCache } from "@/lib/hit-test-cache";

export const createLayersSlice: StateCreator<EditorState, [], [], LayersSlice> = (
  set,
  get,
) => ({
  layers: [],
  activeLayerId: null,

  addLayer: async (bytes, name) => {
    const { documentWidth, documentHeight } = get();
    const layer = await createLayer(bytes, name, documentWidth * 2, documentHeight * 2);
    get().pushSnapshot();
    set((s) => ({
      layers: [...s.layers, layer],
      activeLayerId: layer.id,
    }));
  },

  removeLayer: (id) => {
    invalidateAlphaCache(id);
    get().pushSnapshot();
    set((s) => {
      const layers = s.layers.filter((l) => l.id !== id);
      const activeLayerId =
        s.activeLayerId === id
          ? (layers[layers.length - 1]?.id ?? null)
          : s.activeLayerId;
      return { layers, activeLayerId };
    });
  },

  setActiveLayer: (id) => set({ activeLayerId: id }),

  toggleVisibility: (id) => {
    set((s) => ({
      layers: s.layers.map((l) =>
        l.id === id ? { ...l, visible: !l.visible } : l,
      ),
    }));
  },

  setOpacity: (id, opacity) => {
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, opacity } : l)),
    }));
  },

  setBlendMode: (id, blendMode) => {
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, blendMode } : l)),
    }));
  },

  setTransform: (id, partial) => {
    set((s) => ({
      layers: s.layers.map((l) =>
        l.id === id
          ? { ...l, transform: { ...l.transform, ...partial } }
          : l,
      ),
    }));
  },

  reorderLayers: (fromIndex, toIndex) => {
    get().pushSnapshot();
    set((s) => {
      const layers = [...s.layers];
      const [moved] = layers.splice(fromIndex, 1);
      layers.splice(toIndex, 0, moved);
      return { layers };
    });
  },

  renameLayer: (id, name) => {
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, name } : l)),
    }));
  },

  duplicateLayer: (id) => {
    get().pushSnapshot();
    set((s) => {
      const source = s.layers.find((l) => l.id === id);
      if (!source) return s;
      const dup: typeof source = {
        ...source,
        id: crypto.randomUUID(),
        name: `${source.name} copy`,
        transform: { ...source.transform, x: source.transform.x + 20, y: source.transform.y + 20 },
      };
      const idx = s.layers.findIndex((l) => l.id === id);
      const layers = [...s.layers];
      layers.splice(idx + 1, 0, dup);
      return { layers, activeLayerId: dup.id };
    });
  },

  toggleLock: (id) => {
    set((s) => ({
      layers: s.layers.map((l) =>
        l.id === id ? { ...l, locked: !l.locked } : l,
      ),
    }));
  },

  applyWasmToLayer: async (id, processedBytes) => {
    get().pushSnapshot();
    const bitmap = await decodeToBitmap(processedBytes);
    set((s) => ({
      layers: s.layers.map((l) =>
        l.id === id
          ? {
              ...l,
              imageBytes: processedBytes,
              imageBitmap: bitmap,
              width: bitmap.width,
              height: bitmap.height,
            }
          : l,
      ),
    }));
  },
});
