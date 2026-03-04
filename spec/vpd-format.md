# VPD File Format Specification

**Version:** 1.0
**Extension:** `.vpd`
**MIME type:** `application/x-vizpix-document`

---

## Overview

A `.vpd` file is a **ZIP archive** with a defined internal structure. This makes it inspectable with standard tools, streamable, and extensible without breaking backwards compatibility.

The format stores everything needed to fully restore an editing session: document metadata, layer properties, and the raw image data for each layer.

---

## Archive Structure

```
document.vpd (ZIP)
├── manifest.json          # Document metadata + layer tree
├── blobs/
│   ├── <layer-id-1>.png   # Raw image bytes for layer 1
│   ├── <layer-id-2>.png   # Raw image bytes for layer 2
│   └── ...
└── thumbnail.png           # 256px preview thumbnail (optional)
```

### Why ZIP?

- Native browser support via `CompressionStream` / libraries like `fflate`
- Images are already compressed (PNG/JPEG), so ZIP's store mode avoids double-compression
- Users can rename `.vpd` to `.zip` and inspect contents
- Future layer types (shapes, text) are JSON — ZIP compresses those well

---

## manifest.json

The manifest is the single source of truth for document state. All properties needed to reconstruct the editor session are here.

```jsonc
{
  "version": 1,
  "generator": "vizpix",

  "document": {
    "width": 1920,
    "height": 1080,
    "background": "#ffffff"
  },

  "layers": [
    {
      "id": "a1b2c3d4-...",
      "type": "image",
      "name": "Background",
      "blob": "blobs/a1b2c3d4-....png",
      "width": 1920,
      "height": 1080,
      "visible": true,
      "locked": false,
      "opacity": 1.0,
      "blendMode": "normal",
      "transform": {
        "x": 0,
        "y": 0,
        "scaleX": 1.0,
        "scaleY": 1.0,
        "rotation": 0
      }
    }
  ]
}
```

### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | `number` | yes | Format version. Always `1` for this spec. Used for migration logic. |
| `generator` | `string` | yes | Application that created the file. Always `"vizpix"`. |
| `document` | `object` | yes | Canvas dimensions and background. |
| `layers` | `array` | yes | Ordered array of layers. Index 0 = bottom layer (matches current runtime order). |

### Document Object

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `width` | `number` | yes | — | Canvas width in pixels |
| `height` | `number` | yes | — | Canvas height in pixels |
| `background` | `string` | yes | — | Hex color string, e.g. `"#ffffff"` |

### Layer Object (type: "image")

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | `string` | yes | — | UUID. Preserved across save/load. |
| `type` | `string` | yes | — | Layer type discriminant. `"image"` for v1. |
| `name` | `string` | yes | — | Display name |
| `blob` | `string` | yes | — | Relative path to image file inside the ZIP |
| `width` | `number` | yes | — | Intrinsic image width in pixels |
| `height` | `number` | yes | — | Intrinsic image height in pixels |
| `visible` | `boolean` | no | `true` | Visibility toggle |
| `locked` | `boolean` | no | `false` | Lock toggle |
| `opacity` | `number` | no | `1.0` | 0.0 – 1.0 |
| `blendMode` | `string` | no | `"normal"` | One of the 12 supported blend modes |
| `transform` | `object` | no | identity | See transform object below |

### Transform Object

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `x` | `number` | `0` | Horizontal offset |
| `y` | `number` | `0` | Vertical offset |
| `scaleX` | `number` | `1.0` | Horizontal scale |
| `scaleY` | `number` | `1.0` | Vertical scale |
| `rotation` | `number` | `0` | Degrees |

All transform fields are optional. Missing fields use their defaults. This keeps files small when layers haven't been moved.

---

## Blobs Directory

Each layer's image data is stored as a separate file under `blobs/`.

- **Filename:** `<layer-id>.<ext>` where `<ext>` matches the original encoding format (typically `png`)
- **Content:** The raw encoded image bytes — identical to `layer.imageBytes` in the runtime store
- **Encoding:** PNG is the default. JPEG is acceptable for layers that were originally JPEG. The format is detected from the blob's magic bytes on load, not from the extension.

### Why separate files instead of base64 in JSON?

- Avoids bloating the manifest (a 4K PNG is ~25MB as base64)
- ZIP can store each blob with optimal compression (or no compression for already-compressed formats)
- Parallel extraction — blobs can be read independently

---

## Thumbnail (Optional)

`thumbnail.png` is a 256px-wide preview of the composited document. It exists so file browsers and OS-level previews can show a meaningful icon without parsing the full document.

- **Max dimensions:** 256 x 256 (aspect ratio preserved)
- **Format:** Always PNG
- **Generation:** Created on save by downscaling the current canvas composite

---

## Versioning & Migration

The `version` field enables forward-compatible evolution:

- **v1:** Image layers only (this spec)
- **v2+:** Future additions (shape layers, text layers, masks, groups) will increment the version

### Reader rules:

1. If `version > supported`, warn the user that some features may not load correctly
2. Unknown fields in layer objects are **preserved but ignored** — a v1 reader encountering a `"type": "text"` layer skips it without error
3. Unknown top-level manifest keys are preserved on round-trip (save after load keeps them)

This ensures files created by newer versions of Vizpix degrade gracefully in older versions.

---

## Future Layer Types (Reserved, Not Yet Implemented)

These type discriminants are reserved for future use. They are documented here so the v1 format is designed with them in mind, even though v1 only implements `"image"`.

### Shape Layer

```jsonc
{
  "type": "shape",
  "shapeType": "rectangle",  // "rectangle" | "ellipse" | "line" | "polygon"
  "fill": "#ff0000",
  "stroke": "#000000",
  "strokeWidth": 2,
  "points": [],               // For polygon/line
  "cornerRadius": 0,          // For rectangle
  // ... standard layer fields (id, name, transform, opacity, etc.)
  // No "blob" field — shapes are defined by their properties
}
```

### Text Layer

```jsonc
{
  "type": "text",
  "content": "Hello World",
  "fontFamily": "Inter",
  "fontSize": 24,
  "fontWeight": 400,
  "fontStyle": "normal",
  "color": "#000000",
  "textAlign": "left",
  // ... standard layer fields
  // No "blob" field — text is rendered at runtime
}
```

### Group Layer

```jsonc
{
  "type": "group",
  "children": [
    // ... nested layer objects (any type, including groups)
  ],
  // ... standard layer fields (opacity, blendMode, transform apply to group as a whole)
  // No "blob" field
}
```

### Mask

Masks are not a layer type but a property on any layer:

```jsonc
{
  "type": "image",
  "mask": {
    "blob": "blobs/<mask-id>.png",
    "inverted": false
  },
  // ... other fields
}
```

---

## Implementation Plan

### Phase 1: Save (VPD Export)

1. Add `fflate` dependency (fast, small, no-WASM ZIP library)
2. Create `ui/src/lib/vpd.ts` with a `saveVpd()` function:
   - Read document state + layers from store
   - Build `manifest.json`
   - Collect layer image bytes into `blobs/`
   - Generate thumbnail by downscaling canvas
   - Pack into ZIP using fflate
   - Trigger browser download as `.vpd`
3. Add "Save Project" button to the toolbar (next to Export)

### Phase 2: Load (VPD Import)

1. Add `loadVpd(file: File)` to `vpd.ts`:
   - Unzip with fflate
   - Parse and validate `manifest.json`
   - Extract blobs, decode each to `ImageBitmap`
   - Reconstruct `Layer[]` array
   - Set document dimensions + background
   - Replace store state
2. Add "Open Project" button to the toolbar
3. Handle the launch screen — offer "Open existing" alongside "New Canvas"

### Phase 3: Auto-save (Optional, Future)

- Persist to IndexedDB using the same VPD binary format
- Auto-save on every meaningful state change (debounced)
- Restore on page reload
- This is explicitly out of scope for v1

---

## Size Considerations

A VPD file's size is dominated by the image blobs. The manifest is typically <1KB.

| Scenario | Approximate Size |
|----------|-----------------|
| 1 layer, 1080p PNG | ~5 MB |
| 5 layers, 1080p PNGs | ~25 MB |
| 10 layers, 4K PNGs | ~200 MB |

ZIP's store mode (no compression) is recommended for image blobs since PNG/JPEG are already compressed. The manifest and thumbnail should use deflate.

---

## File Identification

VPD files can be identified by:

1. **Extension:** `.vpd`
2. **ZIP magic bytes:** `PK\x03\x04` at offset 0
3. **Manifest presence:** ZIP contains `manifest.json` at root
4. **Generator field:** `manifest.json` contains `"generator": "vizpix"`

This allows OS-level file type registration and drag-and-drop detection.
