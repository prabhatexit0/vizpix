# Vizpix: Architecture

## Overview

Vizpix is a browser-native image editor. All processing happens client-side — there is no backend. Heavy pixel work runs in Rust/WASM; the UI is React with Canvas 2D rendering.

## Tech Stack

- **Frontend:** React 19 + Vite + Tailwind CSS + shadcn/ui
- **WASM Engine:** Rust (`image` crate) compiled via `wasm-pack`
- **State:** Zustand with modular slices
- **Build:** Makefile orchestrating npm + cargo + wasm-pack

## Monorepo Layout

- `/ui` — Vite + React frontend
- `/engine` — Rust WASM library
- `/Makefile` — Cross-ecosystem build targets

## Data Flow

1. User drops/selects images — read as `Uint8Array`
2. Layers stored in Zustand with raw bytes + decoded `ImageBitmap`
3. Canvas compositor renders layers each frame (RAF loop) with viewport transforms
4. For filters/adjustments, bytes are passed to WASM, processed in Rust, and returned
5. Export composites all layers onto an OffscreenCanvas and downloads as PNG/JPEG

## State Architecture

Zustand store composed from six slices:

| Slice | Responsibility |
|-------|---------------|
| `LayersSlice` | Layer CRUD, transforms, blend modes, opacity |
| `ViewportSlice` | Pan, zoom, fit-to-document |
| `ToolsSlice` | Active tool + panel selection |
| `HistorySlice` | Undo/redo via layer snapshots |
| `DocumentSlice` | Canvas dimensions + background color |
| `WasmSlice` | WASM module initialization |

## Rendering Pipeline

The `useCanvasCompositor` hook runs each frame:

1. Clear canvas, draw checkerboard background
2. Apply viewport transform (translate to center + zoom)
3. Draw document bounds (background fill + border stroke)
4. For each visible layer: apply opacity, blend mode, transform, draw image

Transform handles are an SVG overlay with pointer-event-driven resize/move interactions.

## Key Patterns

- **Responsive:** `useResponsive()` hook — desktop gets sidebar panels, mobile gets bottom drawer
- **Interactions:** Pointer tool (select/move/resize), Hand tool (pan), Zoom tool (click zoom)
- **History:** Snapshot-based — stores serialized layer arrays, reconstructs `ImageBitmap` on undo/redo
