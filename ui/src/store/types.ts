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

export type ToolMode =
  | 'pointer'
  | 'hand'
  | 'zoom'
  | 'crop'
  | 'draw-rectangle'
  | 'draw-ellipse'
  | 'draw-text'

export interface LayerTransform {
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
}

// --- Fill / Stroke / Gradient types ---

export interface GradientStop {
  offset: number
  color: string
}

export interface Gradient {
  stops: GradientStop[]
  angle: number
}

export interface ConicGradient {
  stops: GradientStop[]
  angle: number
}

export type Fill =
  | { type: 'none' }
  | { type: 'solid'; color: string }
  | { type: 'linear-gradient'; gradient: Gradient }
  | { type: 'radial-gradient'; gradient: Gradient }
  | { type: 'conic-gradient'; gradient: ConicGradient }

export interface Stroke {
  color: string
  width: number
  alignment: 'center' | 'inside' | 'outside'
}

export interface Point {
  x: number
  y: number
}

export type ShapeType = 'rectangle' | 'ellipse' | 'line' | 'polygon'
export type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900

// --- Layer Mask ---

export interface LayerMask {
  imageBytes: Uint8Array
  imageBitmap: ImageBitmap | null
  width: number
  height: number
  inverted: boolean
}

// --- Layer Base ---

export interface LayerBase {
  id: string
  type: string
  name: string
  visible: boolean
  opacity: number
  blendMode: BlendMode
  transform: LayerTransform
  locked: boolean
  mask?: LayerMask | null
}

// --- Layer Union ---

export interface ImageLayer extends LayerBase {
  type: 'image'
  imageBytes: Uint8Array
  originalBytes: Uint8Array
  imageBitmap: ImageBitmap | null
  width: number
  height: number
}

export interface ShapeLayer extends LayerBase {
  type: 'shape'
  shapeType: ShapeType
  width: number
  height: number
  fill: Fill
  stroke: Stroke
  cornerRadius: number
  points: Point[]
}

export interface TextLayer extends LayerBase {
  type: 'text'
  content: string
  fontFamily: string
  fontSize: number
  fontWeight: FontWeight
  fontStyle: 'normal' | 'italic'
  fill: Fill
  textAlign: 'left' | 'center' | 'right'
  lineHeight: number
  letterSpacing: number
  boxWidth: number | null
  boxHeight: number | 'auto'
}

export interface GroupLayer extends LayerBase {
  type: 'group'
  children: Layer[]
  expanded: boolean
}

export type Layer = ImageLayer | ShapeLayer | TextLayer | GroupLayer

// --- Snapshot types ---

export type LayerSnapshot =
  | Omit<ImageLayer, 'imageBitmap' | 'originalBytes'>
  | ShapeLayer
  | TextLayer
  | GroupSnapshot

export interface GroupSnapshot extends Omit<GroupLayer, 'children'> {
  children: LayerSnapshot[]
}

// --- Viewport ---

export interface Viewport {
  panX: number
  panY: number
  zoom: number
}

// --- Slice interfaces ---

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
  reorderLayers: (layerId: string, toIndex: number, toParentId?: string | null) => void
  renameLayer: (id: string, name: string) => void
  duplicateLayer: (id: string) => void
  toggleLock: (id: string) => void
  applyWasmToLayer: (id: string, processedBytes: Uint8Array) => Promise<void>
  loadDocument: (params: {
    layers: Layer[]
    activeLayerId: string | null
    documentWidth: number
    documentHeight: number
    documentBackground: string
  }) => void

  // Shape layers
  addShapeLayer: (
    shapeType: ShapeType,
    rect?: { x: number; y: number; width: number; height: number },
  ) => void
  updateShapeProperties: (
    id: string,
    props: Partial<
      Pick<ShapeLayer, 'fill' | 'stroke' | 'cornerRadius' | 'points' | 'width' | 'height'>
    >,
  ) => void

  // Text layers
  addTextLayer: (rect?: { x: number; y: number; width: number; height: number }) => void
  updateTextProperties: (
    id: string,
    props: Partial<
      Pick<
        TextLayer,
        | 'content'
        | 'fontFamily'
        | 'fontSize'
        | 'fontWeight'
        | 'fontStyle'
        | 'fill'
        | 'textAlign'
        | 'lineHeight'
        | 'letterSpacing'
        | 'boxWidth'
        | 'boxHeight'
      >
    >,
  ) => void

  // Groups
  groupLayers: (layerIds: string[]) => void
  ungroupLayer: (groupId: string) => void
  moveLayerToGroup: (layerId: string, groupId: string, index: number) => void
  moveLayerOutOfGroup: (layerId: string) => void

  // Masks
  setLayerMask: (layerId: string, maskBytes: Uint8Array) => Promise<void>
  removeLayerMask: (layerId: string) => void
  invertLayerMask: (layerId: string) => void
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
  editingTextLayerId: string | null
  setActiveTool: (tool: ToolMode) => void
  setActivePanel: (panel: string) => void
  setEditingTextLayerId: (id: string | null) => void
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
