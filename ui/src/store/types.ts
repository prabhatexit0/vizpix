export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'

export type ToolMode = 'pointer' | 'hand' | 'zoom' | 'crop'

export interface LayerTransform {
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
}

export interface Layer {
  id: string
  name: string
  imageBytes: Uint8Array
  imageBitmap: ImageBitmap | null
  width: number
  height: number
  visible: boolean
  opacity: number
  blendMode: BlendMode
  transform: LayerTransform
  locked: boolean
}

export type LayerSnapshot = Omit<Layer, 'imageBitmap'>

export interface Viewport {
  panX: number
  panY: number
  zoom: number
}

export interface LayersSlice {
  layers: Layer[]
  activeLayerId: string | null
  addLayer: (bytes: Uint8Array, name?: string) => Promise<void>
  removeLayer: (id: string) => void
  setActiveLayer: (id: string | null) => void
  toggleVisibility: (id: string) => void
  setOpacity: (id: string, opacity: number) => void
  setBlendMode: (id: string, mode: BlendMode) => void
  setTransform: (id: string, transform: Partial<LayerTransform>) => void
  reorderLayers: (fromIndex: number, toIndex: number) => void
  renameLayer: (id: string, name: string) => void
  duplicateLayer: (id: string) => void
  toggleLock: (id: string) => void
  applyWasmToLayer: (id: string, processedBytes: Uint8Array) => Promise<void>
}

export interface ViewportSlice {
  viewport: Viewport
  pan: (dx: number, dy: number) => void
  zoom: (factor: number, centerX?: number, centerY?: number) => void
  setZoom: (zoom: number) => void
  resetViewport: () => void
  fitToDocument: (canvasWidth: number, canvasHeight: number) => void
}

export interface ToolsSlice {
  activeTool: ToolMode
  activePanel: string
  setActiveTool: (tool: ToolMode) => void
  setActivePanel: (panel: string) => void
}

export interface HistorySlice {
  undoStack: LayerSnapshot[][]
  redoStack: LayerSnapshot[][]
  pushSnapshot: () => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
}

export interface WasmSlice {
  wasmReady: boolean
  processing: boolean
  initWasm: () => Promise<void>
  setProcessing: (v: boolean) => void
}

export interface DocumentSlice {
  documentWidth: number
  documentHeight: number
  documentBackground: string
  setDocumentSize: (width: number, height: number) => void
  setDocumentBackground: (color: string) => void
  swapDocumentDimensions: () => void
}

export type EditorState = LayersSlice &
  ViewportSlice &
  ToolsSlice &
  HistorySlice &
  WasmSlice &
  DocumentSlice
