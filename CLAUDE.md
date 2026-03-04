# VizPix — Browser-Based Image Editor

## Project Structure

```
engine/          Rust/WASM image processing (Cargo, wasm-pack)
ui/              React + TypeScript frontend (Vite, Tailwind v4)
  src/
    components/  UI components (canvas/, panels/, dialogs/, layout/, ui/)
    hooks/       Custom React hooks (compositor, interactions, keyboard, responsive)
    lib/         Shared utilities (canvas-utils, export-utils, layer-factory, etc.)
    store/       Zustand store (slices: layers, viewport, tools, history, wasm, document)
    wasm/        Generated WASM bindings (do not edit)
```

## Commands

```
make install          Install all dependencies (npm + cargo)
make dev              Build WASM + start Vite dev server
make build            Production build (WASM release + Vite)
make build-wasm       Debug WASM build only
make lint             Run all linters (TS + Rust)
make format           Format all code (Prettier + rustfmt)
make format-check     Check formatting without writing
make test             Run all tests
make check            Run everything CI runs
```

## Architecture

- **State**: All shared state in Zustand store via slices (`store/slices/`). Component-local state (`useState`/`useRef`) for UI-only concerns.
- **Store slices**: `createLayersSlice`, `createViewportSlice`, `createToolsSlice`, `createHistorySlice`, `createWasmSlice`, `createDocumentSlice`. Combined in `editor-store.ts`.
- **WASM boundary**: Rust handles image decoding, filters, compositing, export. TypeScript handles UI, canvas rendering, interactions. WASM calls go through the store's `applyWasmToLayer` or are imported directly from `@/wasm/vizpix-core/vizpix_core`.
- **Canvas rendering**: `use-canvas-compositor` hook composites layers onto an HTML canvas each frame.
- **Hit testing**: `use-canvas-interactions` handles pointer events. `hit-test-cache.ts` provides pixel-perfect alpha testing.

## Code Conventions

### Naming
- Components: PascalCase matching filename (`EditorCanvas` in `editor-canvas.tsx`)
- Hooks: `use` prefix, camelCase (`useCanvasCompositor`)
- Store slices: `create*Slice` (`createLayersSlice`)
- Types/Interfaces: PascalCase, no `I` prefix (`Layer`, `LayerTransform`)
- Constants: UPPER_SNAKE_CASE (`ZOOM_MIN`, `HISTORY_MAX`)
- Files: kebab-case (`editor-canvas.tsx`, `canvas-utils.ts`)
- CSS: Tailwind only, no custom class names

### Patterns
- Side effects (canvas rendering, keyboard listeners, pointer events) always in custom hooks
- No barrel exports except `store/index.ts`
- No `any` — use `unknown` and narrow
- `components/ui/` is shadcn only — custom components go elsewhere

### Don't
- Don't add JSDoc to obvious functions
- Don't create wrapper components for single-use layouts
- Don't abstract things used only once
- Don't put WASM calls directly in components — route through the store
- Don't add comments to code that's self-explanatory
- Don't add a Co-Authored-By line when committing

## Adding a New Store Slice

1. Define the interface in `store/types.ts`
2. Create `store/slices/my-slice.ts` exporting `createMySlice`
3. Add to the intersection type `EditorState` in `types.ts`
4. Spread into the store in `editor-store.ts`

## Adding a New WASM Function

1. Add the `#[wasm_bindgen] pub fn` in `engine/src/lib.rs`
2. Run `make build-wasm` to regenerate bindings
3. Import from `@/wasm/vizpix-core/vizpix_core` in TypeScript
