import type { StateCreator } from "zustand";
import type { EditorState, WasmSlice } from "../types";

export const createWasmSlice: StateCreator<EditorState, [], [], WasmSlice> = (set) => ({
  wasmReady: false,
  processing: false,

  initWasm: async () => {
    const wasm = await import("@/wasm/vizpix-core/vizpix_core");
    await wasm.default();
    set({ wasmReady: true });
  },

  setProcessing: (v) => set({ processing: v }),
});
