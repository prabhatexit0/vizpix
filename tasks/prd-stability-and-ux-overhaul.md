# PRD: VizPix Stability & UX Overhaul

## Introduction

VizPix is a browser-based image editor built with React + Rust/WASM. The core architecture is solid, but the current version has bugs across most subsystems and the UX feels early-stage. This PRD covers a comprehensive pass to fix bugs, improve reliability, and polish the user experience — particularly around text layers, image adjustments, layer management, export, canvas interactions, and tool discoverability.

## Goals

- Fix all known bugs that cause data corruption, silent failures, or incorrect output
- Overhaul text layers to use a Figma-like decoupled textbox/font model
- Make image adjustments robust against race conditions and memory issues
- Ensure export produces correct output (masks, blend modes) with clear error reporting
- Improve canvas interaction feel (transform handles, zoom/pan, feedback)
- Make tools and controls more discoverable and forgiving
- Keep everything 100% browser-side — no server dependencies

## User Stories

---

### Phase 1: Text Layer Overhaul

### US-001: Decouple textbox dimensions from font size
**Description:** As a user, I want resizing my text layer's bounding box to change where text wraps — not scale the font — so that text behaves like Figma.

**Acceptance Criteria:**
- [ ] `TextLayer` type gains explicit `boxWidth: number | null` and `boxHeight: number | 'auto'` fields, replacing the current `maxWidth`
- [ ] Dragging transform handles on a text layer updates `boxWidth`/`boxHeight`, not `scaleX`/`scaleY`
- [ ] Font size remains unchanged when resizing the textbox
- [ ] Text wraps to `boxWidth` when set; expands freely when `boxWidth` is null (auto-width mode)
- [ ] Height auto-grows to fit content when `boxHeight` is `'auto'`
- [ ] Existing `.vpd` files with `maxWidth` migrate to `boxWidth` on load
- [ ] Typecheck/lint passes

### US-002: Show textbox bounding box during editing
**Description:** As a user, I want to see the outline of my text layer's bounding box while editing so I know where text will wrap.

**Acceptance Criteria:**
- [ ] Blue dashed border renders around the text layer bounds during inline editing
- [ ] Border reflects actual `boxWidth`/`boxHeight` (or auto-calculated dimensions)
- [ ] Border is visible at all zoom levels (stroke width adjusts for zoom)
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-003: Improve text creation flow
**Description:** As a user, I want a clear two-step flow: drag to create a textbox, then start typing — so creation and editing feel intentional.

**Acceptance Criteria:**
- [ ] Click (no drag) creates an auto-width text layer and immediately enters edit mode
- [ ] Click-drag creates a fixed-width text layer with `boxWidth` set to drag width, then enters edit mode
- [ ] Minimum drag threshold remains at 4px to distinguish click from drag
- [ ] Default placeholder text is empty string (not "Text") — cursor blinks in empty box
- [ ] Escape exits editing; if text is still empty, delete the layer
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-004: Add text selection highlighting
**Description:** As a user, I want to see highlighted text when I select a range so editing feels like a real text editor.

**Acceptance Criteria:**
- [ ] Click-drag within text selects a character range with a visible highlight
- [ ] Double-click selects a word; triple-click selects all text
- [ ] Selection highlight color is semi-transparent blue
- [ ] Selected text can be deleted, replaced by typing, or copied
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-005: Fix text hit-testing with scaled layers
**Description:** As a user, I want to be able to click on text layers reliably regardless of how they've been transformed.

**Acceptance Criteria:**
- [ ] Hit-testing for text layers factors in `scaleX` and `scaleY` when computing bounds
- [ ] Clicking anywhere within the visible text area selects the layer
- [ ] Works correctly with rotated text layers
- [ ] Typecheck/lint passes

---

### Phase 2: Image Adjustments Stability

### US-006: Fix adjustment race conditions on layer switch
**Description:** As a developer, I need the adjust panel to safely handle rapid layer switches and slider changes so adjustments don't corrupt layer data.

**Acceptance Criteria:**
- [ ] Debounce timeout is cleared on component unmount (cleanup in useEffect)
- [ ] Switching the active layer while an adjustment is in-flight cancels the pending operation
- [ ] `baseRef` is invalidated and re-captured when `activeLayerId` changes
- [ ] `store.processing` flag prevents overlapping WASM calls
- [ ] Typecheck/lint passes

### US-007: Improve adjustment panel UX
**Description:** As a user, I want clear feedback when adjustments are being applied and the ability to reset individual sliders.

**Acceptance Criteria:**
- [ ] Each slider has a reset button (appears when value is non-zero) that resets to default
- [ ] Double-click on a slider resets it to default value
- [ ] Progress indicator (shimmer bar or spinner) is visible during WASM processing
- [ ] Sliders are disabled (not just visually — pointer-events-none) while WASM is processing
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-008: Preserve original image bytes for non-destructive editing
**Description:** As a user, I want to reopen the adjust panel later and still tweak from the original image — not from a previously-adjusted version.

**Acceptance Criteria:**
- [ ] `ImageLayer` type gains an `originalBytes: Uint8Array` field set on first import
- [ ] All adjustments are computed from `originalBytes`, not from `imageBytes`
- [ ] `imageBytes` stores the result of the latest adjustment chain
- [ ] "Reset All" restores `imageBytes` from `originalBytes`
- [ ] Undo/redo snapshots store `imageBytes` only (not `originalBytes`, to save memory)
- [ ] Typecheck/lint passes

---

### Phase 3: Layer Management Fixes

### US-009: Fix layer reordering within groups
**Description:** As a user, I want drag-and-drop reordering to work correctly for layers inside groups, not just root-level layers.

**Acceptance Criteria:**
- [ ] Dragging a layer within a group reorders it among siblings
- [ ] Dragging a layer out of a group moves it to root level at the drop position
- [ ] Dragging a layer into a group inserts it at the drop position within the group
- [ ] Reorder logic uses tree-aware indexing, not flat array indices
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-010: Prevent group hierarchy cycles
**Description:** As a developer, I need `moveLayerToGroup` to reject moves that would create a cycle in the layer tree.

**Acceptance Criteria:**
- [ ] `moveLayerToGroup(layerId, groupId)` checks if `groupId` is a descendant of `layerId`
- [ ] If cycle detected, the move is silently rejected (no-op)
- [ ] Typecheck/lint passes

### US-011: Fix active layer selection after deletion
**Description:** As a user, I want deleting a layer to select the nearest layer in z-order — not jump to the bottom of the stack.

**Acceptance Criteria:**
- [ ] After deleting active layer at index N, the layer at index N-1 becomes active (or N+1 if N was 0)
- [ ] If no layers remain, `activeLayerId` is set to null
- [ ] Works correctly for layers inside groups
- [ ] Typecheck/lint passes

### US-012: Fix deep clone for gradient fills
**Description:** As a developer, I need `duplicateLayer` to deep-clone gradient stops so duplicated layers don't share references.

**Acceptance Criteria:**
- [ ] Gradient `stops` array is deep-cloned during `duplicateLayer`
- [ ] Modifying a duplicated layer's gradient does not affect the original
- [ ] Typecheck/lint passes

---

### Phase 4: Export Reliability

### US-013: Fix WASM export to include layer masks
**Description:** As a user, I want exported images to include layer masks so my exports match what I see on canvas.

**Acceptance Criteria:**
- [ ] `exportCanvasWasm` passes mask data to the Rust `composite_and_export` function
- [ ] Mask inversion flag is respected during export
- [ ] Exported PNG/JPEG matches canvas rendering when masks are applied
- [ ] Typecheck/lint passes

### US-014: Replace silent Canvas2D fallback with error reporting
**Description:** As a user, I want to know if my export used a fallback path that might produce different results.

**Acceptance Criteria:**
- [ ] If WASM export fails, show a toast/warning: "Export used fallback renderer. Masks and some blend modes may differ."
- [ ] User can still download the Canvas2D result
- [ ] Error details logged to console for debugging
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-015: Add export quality preview
**Description:** As a user, I want to see a thumbnail preview of my export before downloading — especially for JPEG quality.

**Acceptance Criteria:**
- [ ] Export dialog shows a small preview thumbnail (max 300px wide)
- [ ] Preview updates when format or quality changes (debounced, 500ms)
- [ ] File size estimate shown below preview
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

---

### Phase 5: Canvas Interaction Polish

### US-016: Improve transform handle feel
**Description:** As a user, I want transform handles to be easier to grab and give clear visual feedback during drag.

**Acceptance Criteria:**
- [ ] Handle hit areas increased to at least 16px (from 10px + 4px padding)
- [ ] Active handle highlights blue while being dragged
- [ ] Cursor changes to appropriate resize cursor based on handle position and layer rotation
- [ ] Shift-drag enforces aspect ratio lock (already works, verify)
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-017: Add smooth zoom animation
**Description:** As a user, I want zoom transitions to feel smooth rather than snapping instantly.

**Acceptance Criteria:**
- [ ] Mouse wheel zoom animates over ~100ms using requestAnimationFrame
- [ ] Zoom tool click animates to new zoom level
- [ ] Fit-to-document animates pan and zoom together
- [ ] Animation can be interrupted by new zoom input (no queuing)
- [ ] Typecheck/lint passes

### US-018: Improve toolbar discoverability
**Description:** As a user, I want the toolbar to clearly show what tools are available and which one is active.

**Acceptance Criteria:**
- [ ] Active tool has a stronger visual indicator (solid background, not just 20% opacity)
- [ ] Tool icons increased to 20px (from 18px) on desktop
- [ ] Draw tools (rectangle, ellipse, text) grouped visually with a label or section divider
- [ ] Mobile tap targets increased to at least 44px (Apple HIG minimum)
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-019: Add visual feedback for layer selection on canvas
**Description:** As a user, I want to see which layer is selected on the canvas even when I'm not hovering transform handles.

**Acceptance Criteria:**
- [ ] Selected layer shows a subtle outline (1px blue, zoom-aware) on canvas at all times
- [ ] Outline disappears when no layer is selected
- [ ] Outline does not interfere with transform handles
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

---

### Phase 6: Properties Panel & Controls

### US-020: Add input validation to numeric property fields
**Description:** As a user, I want numeric inputs to reject invalid values so I can't accidentally break my layer transforms.

**Acceptance Criteria:**
- [ ] Scale inputs have min=0.01 (no zero or negative scale)
- [ ] Rotation input clamps display to 0-359.99 (stores actual value, displays modulo)
- [ ] Shape width/height inputs have min=1
- [ ] Opacity clamped to 0-100
- [ ] Invalid input reverts to last valid value on blur
- [ ] Typecheck/lint passes

### US-021: Debounce property inputs to avoid undo spam
**Description:** As a user, I want typing "120" into the X position field to create one undo entry — not three.

**Acceptance Criteria:**
- [ ] Numeric inputs commit to store on blur or Enter, not on every keystroke
- [ ] Slider changes push a single snapshot on pointerup, not during drag
- [ ] Undo after a property edit reverts the entire change, not one character
- [ ] Typecheck/lint passes

### US-022: Preserve fill color when switching fill types
**Description:** As a user, I want switching from solid fill to gradient and back to not lose my original color.

**Acceptance Criteria:**
- [ ] Switching from solid to gradient uses the current solid color as the first gradient stop
- [ ] Switching from gradient back to solid uses the first gradient stop color
- [ ] Typecheck/lint passes

---

### Phase 7: History & Memory

### US-023: Reduce history memory footprint
**Description:** As a developer, I need the undo system to avoid consuming gigabytes of memory on documents with large images.

**Acceptance Criteria:**
- [ ] History snapshots store only layers that changed since the previous snapshot (delta-based)
- [ ] Unchanged image layers reference the same `Uint8Array` (no copy)
- [ ] `HISTORY_MAX` dynamically reduces if estimated memory exceeds 500MB
- [ ] Console warning logged when history is trimmed due to memory pressure
- [ ] Typecheck/lint passes

### US-024: Fix active layer selection after undo
**Description:** As a user, I want undo to re-select the layer I was editing — not jump to the last layer in the stack.

**Acceptance Criteria:**
- [ ] Undo/redo restores `activeLayerId` from the snapshot
- [ ] If the previously-active layer no longer exists in the restored state, select the nearest layer
- [ ] Typecheck/lint passes

---

## Functional Requirements

- FR-1: Text layers must have explicit `boxWidth`/`boxHeight` decoupled from `scaleX`/`scaleY`
- FR-2: Transform handles on text layers must resize the textbox, not scale the layer
- FR-3: Text inline editor must show bounding box outline and support text selection highlighting
- FR-4: Empty text layers created by accident (Escape with no content) must be auto-deleted
- FR-5: Adjustment panel must cancel in-flight WASM operations on layer switch or unmount
- FR-6: `ImageLayer` must store `originalBytes` for true non-destructive editing
- FR-7: Layer reorder must work within groups, between groups, and at root level
- FR-8: `moveLayerToGroup` must reject cycles
- FR-9: Layer deletion must select the nearest sibling, not the last layer
- FR-10: `duplicateLayer` must deep-clone gradient stops
- FR-11: WASM export must composite masks; Canvas2D fallback must warn the user
- FR-12: Export dialog must show quality preview with file size estimate
- FR-13: Transform handles must have 16px+ hit areas and visual drag feedback
- FR-14: Zoom must animate over ~100ms (interruptible)
- FR-15: Toolbar must have stronger active-tool indicator and larger mobile tap targets
- FR-16: Selected layer must show a persistent outline on canvas
- FR-17: Numeric property inputs must validate, clamp, and commit on blur/Enter
- FR-18: Property changes must create one undo entry per logical edit, not per keystroke
- FR-19: Fill type switching must preserve color state
- FR-20: History snapshots must use delta storage to reduce memory
- FR-21: Undo/redo must restore `activeLayerId` from the snapshot

## Non-Goals

- No new features (filters, effects, new layer types) — this is strictly stability + UX polish
- No server-side processing or cloud save
- No collaborative/multiplayer editing
- No animation timeline or video support
- No custom font uploading (Google Fonts integration is a separate effort)
- No plugin/extension system
- No performance profiling or Web Worker migration (separate effort)
- No mobile-first redesign — just fix the worst mobile UX issues

## Design Considerations

- Text bounding box visual should match Figma's style: blue dashed outline, visible resize handles on corners/edges
- Transform handle drag feedback: active handle turns solid blue, others dim slightly
- Toolbar active state: use `bg-blue-500/30` with a left-edge accent bar (2px solid blue) on desktop
- Export preview: render in an offscreen canvas, display as `<img>` in the dialog
- Keep all UI in Tailwind — no custom CSS classes
- Reuse existing shadcn components (`Tooltip`, `Slider`, `Select`, `Dialog`)

## Technical Considerations

- Text box model change (`maxWidth` to `boxWidth`/`boxHeight`) requires a migration path for `.vpd` files — add a version field to the document format
- `originalBytes` on `ImageLayer` doubles memory per image layer — acceptable tradeoff for non-destructive editing; could offload to IndexedDB later
- Delta-based history requires comparing layer arrays by reference, not deep equality — use `Object.is()` on `imageBytes`
- Zoom animation should use a simple lerp in the existing RAF loop, not a separate animation frame
- Mask export requires extending the Rust `composite_and_export` function signature to accept mask data and inversion flags per layer
- Transform handle cursor rotation: compute from layer rotation angle, map to nearest resize cursor (n-resize, ne-resize, etc.)

## Success Metrics

- Zero silent data corruption bugs (no stale closures, no race conditions in adjustments)
- Export output matches canvas rendering for all blend modes and masks
- Text layer resize feels like Figma (textbox resizes, font stays constant)
- Property edits create exactly 1 undo entry per logical change
- Transform handles grabbable on first try (16px+ targets)
- History stays under 500MB for a 10-layer document with 4K images

## Open Questions

- Should text layers support a "fixed size" mode (fixed width AND height, text clips or shrinks to fit)?
- Should we add a "fit to document" keyboard shortcut (Ctrl+Shift+F exists but is it discoverable)?
- For delta-based history: should we use structural sharing (immutable.js style) or manual reference tracking?
- Should the export preview be opt-in (button to generate) or always-on (auto-generate on dialog open)?
- Should zoom animation be configurable (some users prefer instant zoom)?
