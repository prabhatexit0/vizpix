# Extended Layers Specification

**Status:** Draft
**Depends on:** `vpd-format.md`

---

## Overview

This spec adds four capabilities to VizPix:

1. **Shape layers** — rectangles, ellipses, lines, polygons with solid/gradient fills and strokes
2. **Text layers** — editable text rendered at runtime with font, size, color, and alignment controls
3. **Layer masks** — per-layer alpha masks (image-based) with optional inversion
4. **Group layers** — nested containers that act as a single unit for transform, opacity, and blend mode

These require a discriminated union for the runtime `Layer` type, and changes to the compositor, hit testing, export, and history. The VPD format stays at `version: 1` — new layer types are additive extensions within the existing format. Versioning will be introduced later when the format is more mature.

---

## Table of Contents

- [1. Runtime Type System](#1-runtime-type-system)
- [2. Shape Layers](#2-shape-layers)
- [3. Text Layers](#3-text-layers)
- [4. Layer Masks](#4-layer-masks)
- [5. Group Layers](#5-group-layers)
- [6. VPD Format Extensions](#6-vpd-format-extensions)
- [7. Compositor Changes](#7-compositor-changes)
- [8. Hit Testing Changes](#8-hit-testing-changes)
- [9. Export Changes](#9-export-changes)
- [10. History and Snapshots](#10-history-and-snapshots)
- [11. Store Changes](#11-store-changes)
- [12. UI Changes](#12-ui-changes)
- [13. Implementation Phases](#13-implementation-phases)

---

## 1. Runtime Type System

The current `Layer` interface becomes a discriminated union keyed on `type`.

### Base Layer Properties

Every layer type shares these fields:

```ts
interface LayerBase {
  id: string
  type: string
  name: string
  visible: boolean
  opacity: number          // 0.0 – 1.0
  blendMode: BlendMode
  transform: LayerTransform
  locked: boolean
  mask?: LayerMask | null  // optional mask, any layer type
}
```

### Layer Union

```ts
type Layer = ImageLayer | ShapeLayer | TextLayer | GroupLayer

interface ImageLayer extends LayerBase {
  type: 'image'
  imageBytes: Uint8Array
  imageBitmap: ImageBitmap | null
  width: number
  height: number
}

interface ShapeLayer extends LayerBase {
  type: 'shape'
  shapeType: ShapeType
  width: number
  height: number
  fill: Fill
  stroke: Stroke
  cornerRadius: number    // rectangle only, 0 for others
  points: Point[]         // polygon/line only, empty for rect/ellipse
}

interface TextLayer extends LayerBase {
  type: 'text'
  content: string
  fontFamily: string
  fontSize: number
  fontWeight: FontWeight
  fontStyle: 'normal' | 'italic'
  fill: Fill
  textAlign: 'left' | 'center' | 'right'
  lineHeight: number      // multiplier, e.g. 1.4
  letterSpacing: number   // px
  maxWidth: number | null  // null = no wrapping, number = wrap at px width
}

interface GroupLayer extends LayerBase {
  type: 'group'
  children: Layer[]       // ordered bottom-to-top, recursive
  expanded: boolean       // UI-only: whether the group is expanded in the layers panel
}
```

### Snapshot Union

`LayerSnapshot` strips non-serializable fields per type:

```ts
type LayerSnapshot =
  | Omit<ImageLayer, 'imageBitmap'>
  | ShapeLayer
  | TextLayer
  | GroupSnapshot

interface GroupSnapshot extends Omit<GroupLayer, 'children'> {
  children: LayerSnapshot[]
}
```

Shape and text layers are fully serializable — no fields to strip. Image layers drop `imageBitmap`. Group layers recursively snapshot their children.

---

## 2. Shape Layers

### Shape Types

```ts
type ShapeType = 'rectangle' | 'ellipse' | 'line' | 'polygon'
```

### Fill

A fill is either nothing, a solid color, or a gradient:

```ts
type Fill =
  | { type: 'none' }
  | { type: 'solid'; color: string }             // hex, e.g. "#ff0000"
  | { type: 'linear-gradient'; gradient: Gradient }
  | { type: 'radial-gradient'; gradient: Gradient }
  | { type: 'conic-gradient'; gradient: ConicGradient }
```

### Gradient

```ts
interface GradientStop {
  offset: number   // 0.0 – 1.0
  color: string    // hex with optional alpha, e.g. "#ff000080"
}

interface Gradient {
  stops: GradientStop[]  // minimum 2 stops
  angle: number          // degrees, for linear only (ignored by radial)
  // For linear: angle defines direction, 0 = left-to-right, 90 = top-to-bottom
  // For radial: centered in shape bounding box
}

interface ConicGradient {
  stops: GradientStop[]
  angle: number          // start angle in degrees
  // Centered in shape bounding box
}
```

### Stroke

```ts
interface Stroke {
  color: string       // hex
  width: number       // px, 0 = no stroke
  alignment: 'center' | 'inside' | 'outside'
}
```

### Point (for polygon/line)

```ts
interface Point {
  x: number
  y: number
}
```

Points are in **local coordinates** relative to the shape's center. The shape's `width` and `height` define its bounding box. When a polygon is created, points are normalized to fit within `[-width/2, width/2]` x `[-height/2, height/2]`.

### Defaults

| Field | Default |
|---|---|
| `fill` | `{ type: 'solid', color: '#3b82f6' }` (blue-500) |
| `stroke` | `{ color: '#000000', width: 0, alignment: 'center' }` |
| `cornerRadius` | `0` |
| `points` | `[]` |
| `width` | `200` |
| `height` | `200` (line: `height: 0`) |

### Rendering

Shapes are rendered with Canvas2D path operations:

- **Rectangle**: `ctx.roundRect(x, y, w, h, cornerRadius)` or `ctx.rect()` when radius is 0
- **Ellipse**: `ctx.ellipse(cx, cy, rx, ry, 0, 0, 2π)`
- **Line**: `ctx.moveTo(x1, y1); ctx.lineTo(x2, y2)` — uses stroke only, fill ignored
- **Polygon**: `ctx.moveTo` + `ctx.lineTo` for each point, then `ctx.closePath()`

Gradient fills create a `CanvasGradient` object:
- Linear: `ctx.createLinearGradient(...)` rotated by `gradient.angle`
- Radial: `ctx.createRadialGradient(cx, cy, 0, cx, cy, max(w,h)/2)`
- Conic: `ctx.createConicGradient(angle, cx, cy)`

Stroke alignment is handled by clipping:
- `center`: stroke as-is
- `inside`: clip to fill path before stroking with 2x width
- `outside`: clip to inverse of fill path before stroking with 2x width

---

## 3. Text Layers

### Properties

```ts
type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900
```

| Field | Default |
|---|---|
| `content` | `'Text'` |
| `fontFamily` | `'Inter'` |
| `fontSize` | `24` |
| `fontWeight` | `400` |
| `fontStyle` | `'normal'` |
| `fill` | `{ type: 'solid', color: '#ffffff' }` |
| `textAlign` | `'left'` |
| `lineHeight` | `1.4` |
| `letterSpacing` | `0` |
| `maxWidth` | `null` |

### Rendering

Text is rendered via Canvas2D `fillText` / `strokeText`:

```
ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`
ctx.textAlign = textAlign
ctx.textBaseline = 'top'
ctx.letterSpacing = `${letterSpacing}px`
```

Line wrapping (when `maxWidth !== null`) is handled by measuring word widths with `ctx.measureText()` and splitting into lines. Each line is drawn at `y += fontSize * lineHeight`.

Text layers have a **computed bounding box** (`width` and `height`) that is recalculated on every property change by measuring the text with an offscreen canvas. This bounding box is used for hit testing and selection handles.

### Fill on Text

Text layers reuse the same `Fill` type as shapes. Gradient fills are applied by:
1. Rendering text to an `OffscreenCanvas` in white
2. Using `ctx.globalCompositeOperation = 'source-in'` to apply the gradient

### Editing

Double-clicking a text layer enters inline edit mode:
- An HTML `<textarea>` overlay is positioned over the canvas at the text layer's screen position
- The textarea is styled to match the text layer's font properties
- On blur or Escape, the edit commits and the overlay is removed
- On Enter (without Shift), the edit commits

This is a UI concern, not part of the data model.

---

## 4. Layer Masks

### Data Model

Any layer type can have an optional mask:

```ts
interface LayerMask {
  imageBytes: Uint8Array
  imageBitmap: ImageBitmap | null
  width: number
  height: number
  inverted: boolean
}
```

The mask is a grayscale image where **white = fully visible** and **black = fully hidden**. When `inverted` is true, the meaning is flipped.

### Rendering

Masks are applied during compositing using a temporary canvas:

1. Render the layer to an `OffscreenCanvas` at its intrinsic size
2. Set `globalCompositeOperation = 'destination-in'` (or `'destination-out'` if `inverted`)
3. Draw the mask bitmap
4. Draw the resulting temp canvas onto the main canvas with the layer's transform, opacity, and blend mode

This is more expensive than a direct draw, so it's only used when `layer.mask` is present.

### Mask Editing

Masks can be:
- **Added** from an image file (same flow as adding a layer — file picker → decode)
- **Removed** (set `mask` to null)
- **Inverted** (toggle `mask.inverted`)
- **Replaced** (pick a new image)

Mask editing is exposed in the properties panel when a layer is selected.

Future: painting masks directly on-canvas is out of scope for now.

### Masks on Groups

When a group has a mask, the entire composited group output is masked. The group is first rendered to a temp canvas, then the mask is applied, then the result is drawn to the main canvas.

---

## 5. Group Layers

### Data Model

Groups are containers. Their `children` array is ordered bottom-to-top (same as the top-level `layers` array). Groups can be nested arbitrarily deep.

```ts
interface GroupLayer extends LayerBase {
  type: 'group'
  children: Layer[]
  expanded: boolean  // UI-only: panel expand/collapse state
}
```

Group-level `transform`, `opacity`, and `blendMode` apply to the **composited output** of all children as a unit. A group with `opacity: 0.5` doesn't make each child 50% — it composites children at full opacity, then draws the result at 50%.

### Nesting

- Maximum nesting depth: **8 levels** (enforced in UI, not in format — the reader handles any depth)
- A group with zero children is valid (acts as an invisible no-op)
- Moving a layer into/out of a group is a store operation, not a property change

### Flattening

Groups don't have intrinsic width/height. Their bounding box is the union of all children's transformed bounding boxes. This is computed on demand for hit testing and selection handles.

### Rendering

Groups are rendered recursively:

1. Create a temp `OffscreenCanvas` sized to the document
2. Set the group's transform as the base transform
3. Render each child (recursively, including nested groups) onto the temp canvas
4. If the group has a mask, apply it
5. Draw the temp canvas onto the parent canvas with the group's opacity and blend mode

Optimization: if a group has `opacity: 1`, `blendMode: 'normal'`, and no mask, skip the temp canvas and render children directly (flattened rendering). This is a performance optimization, not a correctness requirement.

---

## 6. VPD Format Extensions

These are additive extensions to the existing VPD format (`version: 1`). No version bump — new layer types and fields are simply additional entries in the manifest. Readers that don't understand a layer type skip it gracefully (per the existing forward-compatibility rules in `vpd-format.md`).

### manifest.json Changes

The top-level structure is unchanged. The `layers` array now contains a mix of layer types.

### Image Layer (unchanged, gains optional mask)

```jsonc
{
  "id": "...",
  "type": "image",
  "name": "Background",
  "blob": "blobs/<id>.png",
  "width": 1920,
  "height": 1080,
  // ... visible, locked, opacity, blendMode, transform (same as v1)
  "mask": {                          // NEW, optional
    "blob": "blobs/<mask-id>.png",
    "inverted": false
  }
}
```

### Shape Layer

```jsonc
{
  "id": "...",
  "type": "shape",
  "name": "Rectangle 1",
  "shapeType": "rectangle",
  "width": 200,
  "height": 200,

  "fill": { "type": "solid", "color": "#3b82f6" },
  // OR
  "fill": {
    "type": "linear-gradient",
    "gradient": {
      "stops": [
        { "offset": 0, "color": "#ff0000" },
        { "offset": 1, "color": "#0000ff" }
      ],
      "angle": 90
    }
  },
  // OR
  "fill": {
    "type": "radial-gradient",
    "gradient": {
      "stops": [
        { "offset": 0, "color": "#ffffff" },
        { "offset": 1, "color": "#000000" }
      ],
      "angle": 0
    }
  },
  // OR
  "fill": {
    "type": "conic-gradient",
    "gradient": {
      "stops": [
        { "offset": 0, "color": "#ff0000" },
        { "offset": 0.33, "color": "#00ff00" },
        { "offset": 0.66, "color": "#0000ff" },
        { "offset": 1, "color": "#ff0000" }
      ],
      "angle": 0
    }
  },
  // OR
  "fill": { "type": "none" },

  "stroke": {
    "color": "#000000",
    "width": 2,
    "alignment": "center"
  },

  "cornerRadius": 8,       // rectangle only
  "points": [],             // polygon/line only

  // ... visible, locked, opacity, blendMode, transform
  "mask": { ... }           // optional
}
```

**Omission rules** (to keep files small):
- `fill` defaults to `{ "type": "solid", "color": "#3b82f6" }` if missing
- `stroke` defaults to `{ "color": "#000000", "width": 0, "alignment": "center" }` if missing
- `cornerRadius` defaults to `0` if missing
- `points` defaults to `[]` if missing
- `shapeType` is required

### Text Layer

```jsonc
{
  "id": "...",
  "type": "text",
  "name": "Text 1",
  "content": "Hello World",
  "fontFamily": "Inter",
  "fontSize": 24,
  "fontWeight": 400,
  "fontStyle": "normal",
  "fill": { "type": "solid", "color": "#ffffff" },
  "textAlign": "left",
  "lineHeight": 1.4,
  "letterSpacing": 0,
  "maxWidth": null,

  // ... visible, locked, opacity, blendMode, transform
  "mask": { ... }           // optional
}
```

**Omission rules:**
- `fontWeight` defaults to `400`
- `fontStyle` defaults to `"normal"`
- `fill` defaults to `{ "type": "solid", "color": "#ffffff" }`
- `textAlign` defaults to `"left"`
- `lineHeight` defaults to `1.4`
- `letterSpacing` defaults to `0`
- `maxWidth` defaults to `null`
- `content`, `fontFamily`, `fontSize` are required

### Group Layer

```jsonc
{
  "id": "...",
  "type": "group",
  "name": "Group 1",
  "children": [
    { "type": "image", ... },
    { "type": "shape", ... },
    { "type": "group", "children": [ ... ] }
  ],

  // ... visible, locked, opacity, blendMode, transform
  "mask": { ... }           // optional
}
```

`children` is required and ordered bottom-to-top. `expanded` is NOT serialized (it's UI-only state, defaulting to `true` on load).

### Blobs Directory

Image layer blobs work the same as v1. Mask blobs are also stored under `blobs/`:

```
blobs/
  <layer-id>.png       # image layer data
  mask-<layer-id>.png  # mask data (if mask exists)
```

Shape and text layers have no blob entries.

### Thumbnail

Same as v1 — 256px composite preview. Now includes shapes and text in the composite.

---

## 7. Compositor Changes

The compositor loop (`use-canvas-compositor.ts`) currently iterates `layers` and calls `ctx.drawImage(layer.imageBitmap, ...)`. This changes to a type-switched dispatch.

### Render Dispatch

```ts
function renderLayer(ctx: CanvasRenderingContext2D, layer: Layer) {
  if (!layer.visible) return

  ctx.save()
  ctx.globalAlpha = layer.opacity
  ctx.globalCompositeOperation = blendModeMap[layer.blendMode]
  applyTransform(ctx, layer.transform)

  switch (layer.type) {
    case 'image':
      renderImageLayer(ctx, layer)
      break
    case 'shape':
      renderShapeLayer(ctx, layer)
      break
    case 'text':
      renderTextLayer(ctx, layer)
      break
    case 'group':
      renderGroupLayer(ctx, layer)
      break
  }

  ctx.restore()
}
```

### Mask Application

When `layer.mask` is present, the layer is rendered to a temp canvas first:

```ts
function renderWithMask(ctx, layer, renderFn) {
  const temp = new OffscreenCanvas(docWidth, docHeight)
  const tctx = temp.getContext('2d')!
  renderFn(tctx)
  tctx.globalCompositeOperation = layer.mask.inverted ? 'destination-out' : 'destination-in'
  tctx.drawImage(layer.mask.imageBitmap, -layer.mask.width / 2, -layer.mask.height / 2)
  ctx.drawImage(temp, -docWidth / 2, -docHeight / 2)
}
```

### Group Rendering

```ts
function renderGroupLayer(ctx, group) {
  // If passthrough possible (opacity 1, normal blend, no mask), render children directly
  if (group.opacity === 1 && group.blendMode === 'normal' && !group.mask) {
    for (const child of group.children) {
      renderLayer(ctx, child)
    }
    return
  }

  // Otherwise, composite children to a temp canvas
  const temp = new OffscreenCanvas(docWidth, docHeight)
  const tctx = temp.getContext('2d')!
  tctx.translate(docWidth / 2, docHeight / 2)
  for (const child of group.children) {
    renderLayer(tctx, child)
  }

  // Apply mask if present, then draw to main canvas
  // ...
}
```

### Performance Notes

- Temp canvas creation per group per frame is expensive. Cache and reuse `OffscreenCanvas` instances where possible.
- For groups without masks/special blend modes, the passthrough optimization avoids all overhead.
- Text measurement (`ctx.measureText`) should be cached and only recomputed when text properties change.

---

## 8. Hit Testing Changes

### Current State

Hit testing iterates layers top-to-bottom, inverse-transforms the pointer into layer-local space, checks bounding box, then checks pixel alpha.

### Changes

**Image layers**: unchanged (bounding box + alpha test).

**Shape layers**: bounding box check first, then path-based containment:
- Rectangle: point-in-rect (accounting for cornerRadius)
- Ellipse: point-in-ellipse formula
- Polygon: point-in-polygon (ray casting)
- Line: distance-to-line < `max(stroke.width / 2, 4px)` (minimum hit area for thin lines)

The `isPointInPath` / `isPointInStroke` Canvas2D API can be used for simplicity, but requires maintaining a `Path2D` per shape. Alternatively, use analytical math which is faster and doesn't require a canvas context.

**Text layers**: bounding box check only (pixel-perfect text hit testing is not worth the cost).

**Group layers**: recursive. Inverse-transform the point by the group's transform, then test each child top-to-bottom. The first child hit returns the child's ID (not the group's). Shift-click or a dedicated tool selects the group itself.

### Alpha Cache

The alpha cache (`hit-test-cache.ts`) only applies to image layers and masks. Shape/text layers don't populate it. The cache key check (`bytesRef === imageBytes`) still works for image layers since the discriminated union narrows the type.

---

## 9. Export Changes

### Canvas2D Path

The Canvas2D export fallback (`exportCanvasCanvas2D`) needs the same type-switched dispatch as the compositor. Extract the render functions into shared utilities used by both the compositor and export.

### WASM Path

The WASM export path currently expects raw RGBA pixels per layer. For shape and text layers, rasterize them to an `OffscreenCanvas` first, extract pixels, and pass them to the WASM compositor as if they were image layers. This is simpler than teaching Rust about shape/text rendering.

### Shared Render Utilities

Extract from the compositor into `lib/layer-render.ts`:

```ts
export function renderLayerToContext(ctx, layer, docWidth, docHeight): void
export function rasterizeLayer(layer, docWidth, docHeight): ImageData
```

These are used by: compositor, export (Canvas2D path), export (WASM path — for rasterizing non-image layers), and thumbnail generation.

---

## 10. History and Snapshots

### Snapshot Changes

The `LayerSnapshot` type becomes a discriminated union matching the `Layer` union but with non-serializable fields stripped.

Only `ImageLayer` and `LayerMask` have non-serializable fields (`imageBitmap`). Shape, text, and group snapshots are identical to their runtime types (groups recurse into children snapshots).

### Restore Changes

`restoreLayers` currently decodes bitmaps for every layer. With the union type:

```ts
async function restoreLayer(snap: LayerSnapshot): Promise<Layer> {
  switch (snap.type) {
    case 'image':
      return { ...snap, imageBitmap: await decodeToBitmap(snap.imageBytes) }
    case 'shape':
    case 'text':
      return { ...snap }  // no async work needed
    case 'group':
      return { ...snap, children: await Promise.all(snap.children.map(restoreLayer)) }
  }
}
```

Mask bitmaps also need restoring:

```ts
if (layer.mask) {
  layer.mask = { ...layer.mask, imageBitmap: await decodeToBitmap(layer.mask.imageBytes) }
}
```

### Performance

Shape and text layers are much cheaper to snapshot and restore than image layers (no bitmap decode). This should improve undo/redo performance for documents that are mostly shapes and text.

---

## 11. Store Changes

### Types (`store/types.ts`)

- Replace the `Layer` interface with the discriminated union
- Add `ShapeLayer`, `TextLayer`, `GroupLayer`, `LayerMask`, `Fill`, `Stroke`, `Gradient`, `GradientStop`, `ConicGradient`, `Point`, `ShapeType`, `FontWeight` types
- Add `LayerBase` interface
- Update `LayerSnapshot` to a union
- Update `LayersSlice` with new actions

### New Actions on `LayersSlice`

```ts
// Shape layers
addShapeLayer: (shapeType: ShapeType) => void
updateShapeProperties: (id: string, props: Partial<Pick<ShapeLayer, 'fill' | 'stroke' | 'cornerRadius' | 'points' | 'width' | 'height'>>) => void

// Text layers
addTextLayer: () => void
updateTextProperties: (id: string, props: Partial<Pick<TextLayer, 'content' | 'fontFamily' | 'fontSize' | 'fontWeight' | 'fontStyle' | 'fill' | 'textAlign' | 'lineHeight' | 'letterSpacing' | 'maxWidth'>>) => void

// Groups
groupLayers: (layerIds: string[]) => void
ungroupLayer: (groupId: string) => void
moveLayerToGroup: (layerId: string, groupId: string, index: number) => void
moveLayerOutOfGroup: (layerId: string) => void

// Masks
setLayerMask: (layerId: string, maskBytes: Uint8Array) => Promise<void>
removeLayerMask: (layerId: string) => void
invertLayerMask: (layerId: string) => void
```

### Layer Lookup

With groups, finding a layer by ID requires recursive search. Add a helper:

```ts
function findLayerById(layers: Layer[], id: string): Layer | null
function findLayerParent(layers: Layer[], id: string): { parent: Layer[] | null; index: number }
```

These are used internally by all slice actions that take an `id`. They walk the tree recursively.

### Reorder

`reorderLayers(fromIndex, toIndex)` currently assumes a flat array. With groups, reordering needs to support:
- Moving within the same level (current behavior)
- Moving into/out of groups (via `moveLayerToGroup` / `moveLayerOutOfGroup`)
- Drag-and-drop UI determines which operation to call based on drop target

---

## 12. UI Changes

### Layers Panel

The layers panel needs significant changes for groups:

- **Indentation**: children of groups are indented (16px per nesting level)
- **Expand/collapse**: clicking the group's disclosure triangle toggles `expanded`
- **Drag targets**: dropping onto a group's header moves the layer into the group; dropping between items reorders within the current level
- **Group selection**: clicking a group selects the group; double-click expands/collapses

### Layer Item

Each layer item shows a type icon:
- Image: `Image` icon
- Shape: icon matching `shapeType` (square, circle, minus for line, pentagon for polygon)
- Text: `Type` icon
- Group: `Folder` icon

The thumbnail for non-image layers is rendered on an `OffscreenCanvas` using the shared render utilities.

### Properties Panel

The properties panel becomes type-aware:

- **Image**: opacity, blend mode, transform (current behavior)
- **Shape**: fill picker (solid/gradient), stroke picker, corner radius (rect only), opacity, blend mode, transform, width/height
- **Text**: content, font family, font size, font weight, font style, fill picker, alignment, line height, letter spacing, max width, opacity, blend mode, transform
- **Group**: opacity, blend mode, transform (applied to group as whole)

All layer types show a **mask section** at the bottom: add/remove/invert mask.

### Fill Picker

A new component for choosing between fill types:

- **None**: no fill
- **Solid**: color picker (hex input + visual picker)
- **Linear gradient**: gradient bar with draggable stops, angle slider
- **Radial gradient**: gradient bar with draggable stops
- **Conic gradient**: gradient bar with draggable stops, start angle

The gradient editor shows:
- A gradient preview bar
- Draggable stop handles below the bar
- Each stop has a color picker
- Add stop by clicking the bar; remove by dragging off
- Angle control (linear and conic only)

### Toolbar

New tool buttons:
- **Rectangle** (`Square` icon) — creates a rectangle shape layer at document center
- **Ellipse** (`Circle` icon) — creates an ellipse shape layer
- **Text** (`Type` icon) — creates a text layer, immediately enters edit mode

These could be grouped under a single "Shapes" dropdown or added as individual tools. Individual tools are simpler to start with.

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `R` | Rectangle tool |
| `E` | Ellipse tool |
| `T` | Text tool |
| `Ctrl+G` | Group selected layers |
| `Ctrl+Shift+G` | Ungroup selected group |

---

## 13. Implementation Phases

### Phase 1: Discriminated Union Refactor

**Goal**: Make the `Layer` type a union without changing visible behavior. All existing functionality continues to work.

1. Add `type: 'image'` to `LayerBase` and the `ImageLayer` interface
2. Add the union type `Layer = ImageLayer` (single member initially)
3. Update compositor, hit testing, export, history to switch on `layer.type`
4. Update VPD save/load to include `type` field in manifest (already present in v1 spec but not used at runtime)
5. Update all slice actions to handle the `type` field
6. **Test**: everything works exactly as before

This is the foundation. Ship it separately before adding new layer types.

### Phase 2: Shape Layers

1. Add `ShapeLayer` to the union and all supporting types (`Fill`, `Stroke`, `Gradient`, etc.)
2. Implement `renderShapeLayer` in compositor
3. Implement shape hit testing
4. Add `addShapeLayer`, `updateShapeProperties` to store
5. Add shape creation buttons to toolbar
6. Add shape properties to the properties panel
7. Build the fill picker component (solid + gradients)
8. Update export to handle shapes
9. Update VPD save/load for shape layers
10. **Test**: create shapes, adjust fills/strokes, save/load, export

### Phase 3: Text Layers

1. Add `TextLayer` to the union
2. Implement `renderTextLayer` in compositor (including text wrapping and gradient fills)
3. Implement text hit testing (bounding box)
4. Add `addTextLayer`, `updateTextProperties` to store
5. Add text tool to toolbar
6. Build inline text editing (textarea overlay)
7. Add text properties to the properties panel
8. Reuse fill picker from Phase 2
9. Update export and VPD save/load
10. **Test**: create text, edit inline, change fonts/sizes, gradient text, save/load

### Phase 4: Layer Masks

1. Add `LayerMask` type and `mask` property to `LayerBase`
2. Implement mask rendering in compositor (temp canvas + `destination-in/out`)
3. Add `setLayerMask`, `removeLayerMask`, `invertLayerMask` to store
4. Update history to snapshot/restore mask bitmaps
5. Add mask section to properties panel
6. Update VPD save/load to handle mask blobs
7. **Test**: add masks to image/shape/text layers, invert, save/load

### Phase 5: Group Layers

1. Add `GroupLayer` to the union
2. Implement recursive rendering in compositor (with passthrough optimization)
3. Implement recursive hit testing
4. Convert flat layer array operations to tree-aware operations (`findLayerById`, `findLayerParent`)
5. Add `groupLayers`, `ungroupLayer`, `moveLayerToGroup`, `moveLayerOutOfGroup` to store
6. Update layers panel for indentation, expand/collapse, group drag targets
7. Update history for recursive group snapshots
8. Update VPD save/load for nested children
9. Apply masks to groups
10. **Test**: create groups, nest groups, reorder within/across groups, mask groups, save/load

### Phase 6: Polish

1. Shared render utilities (`lib/layer-render.ts`) for compositor + export + thumbnail
2. Performance: cache temp canvases, cache text measurements
3. Keyboard shortcuts for shape/text tools and grouping
4. Copy/paste support for new layer types
5. Drag-and-drop reorder with group-aware drop targets

---

## Appendix: Compatibility

New layer types are additive. Older builds that don't understand a `type` value skip that layer on load (per the forward-compatibility rules in `vpd-format.md`). This means:

- A file with shape/text/group layers opened in an image-only build silently drops those layers
- The `mask` field on any layer is ignored by builds that don't support masks
- Layers without a `type` field are treated as `"image"` (backwards compat with early saves)
- No migration step is ever needed — the format is append-only within `version: 1`
