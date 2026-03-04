import { create } from "zustand";
import type { EditorState } from "./types";
import { createLayersSlice } from "./slices/layers-slice";
import { createViewportSlice } from "./slices/viewport-slice";
import { createToolsSlice } from "./slices/tools-slice";
import { createHistorySlice } from "./slices/history-slice";
import { createWasmSlice } from "./slices/wasm-slice";
import { createDocumentSlice } from "./slices/document-slice";

export const useEditorStore = create<EditorState>()((...a) => ({
  ...createLayersSlice(...a),
  ...createViewportSlice(...a),
  ...createToolsSlice(...a),
  ...createHistorySlice(...a),
  ...createWasmSlice(...a),
  ...createDocumentSlice(...a),
}));
