# Ralph Overnight Run — Review Notes

## What happened tonight

### Run 1: UX Visual Polish (`ralph/ux-visual-polish`) — 12/12 stories COMPLETE
Text positioning, SVG overlay fix, thumbnails, selection outlines, toolbar hierarchy, fit-to-document, adjust panel empty states, canvas preview, WASM loading spinner, keyboard shortcut guards, drag-to-reorder layers, delete confirmation dialog.

### Run 2: Rich Text (`ralph/rich-text`) — IN PROGRESS when you went to sleep
Per-character formatting with TextRun[] data model. 13 stories covering data model, rendering, measurement, cursor positioning, selection-aware formatting, properties panel, floating toolbar, keyboard shortcuts, decorations, undo/redo.

### Run 3: Slider & Fine-Tuning UX (`ralph/slider-ux`) — queued after rich text
ScrubInput component (drag-on-label), SliderInput combos, better color picker, rotation dial, focus management, dimension editing with proportional constraints.

### Run 4: Mobile Support (`ralph/mobile-support`) — queued after slider UX
Pinch-zoom, two-finger pan, rotation gesture, responsive layout, mobile toolbar, touch-friendly controls, tablet breakpoint, safe area insets, PWA meta tags, mobile text editing, gesture onboarding.

---

## Assumptions that need your review

### Strong assumptions I made:

1. **Rich text data model uses "runs" approach** — Each text layer stores `runs: TextRun[]` where each run has text + optional formatting overrides. Layer-level properties (fontSize, fontFamily, etc.) become defaults. This is how Figma does it. Alternative would have been a tree-based model (like ProseMirror/Slate) but runs are simpler for a canvas-based editor.

2. **No contentEditable for inline editing** — Kept the hidden textarea approach. A contentEditable div would give us browser-native rich text editing but would be harder to sync with canvas rendering. The textarea approach gives us full control over cursor/selection rendering on the canvas.

3. **Color picker is fully custom** — I specced a custom HSL picker to replace the native `<input type=color>`. This is more work but gives consistent cross-browser appearance and better UX (saturation square, hue bar, alpha slider, swatches). If you'd rather use a library like `react-colorful`, we can simplify this story.

4. **Mobile layout uses Vaul Drawer** for the right panel (already in project). This means the right panel slides over the canvas on phones, not pushes it. The canvas gets full width on mobile.

5. **Three-tier breakpoints**: phone (<768), tablet (768-1023), desktop (>=1024). Currently there's only one breakpoint at 1024px. This adds a tablet tier where the right panel is a narrower sidebar but toolbar floats at bottom.

6. **Pinch/pan/rotate use Pointer Events API** (not Touch Events). This is the modern approach and what the codebase already uses. It works on all modern browsers including iOS Safari 13+.

7. **ScrubInput sensitivity**: 1px drag = 1 unit by default. Shift=10x, Alt/Option=0.1x. This matches Figma's behavior. If you prefer different ratios, those are easy to tweak.

8. **Rotation gesture requires 200ms hold** before activating, to distinguish from pinch-zoom. This is opinionated — some apps activate rotation immediately during pinch.

### Things to double-check:

- **Rich text undo/redo**: I assumed the existing snapshot system captures TextRun[] automatically since it snapshots the full layer. Worth verifying after the run.
- **Mobile text editing**: Virtual keyboard handling is tricky. The story uses `window.visualViewport` API which isn't available in all browsers. May need a fallback.
- **PWA manifest**: I included a basic manifest.json story. If you don't want PWA installability, that can be dropped.
- **Drag-to-reorder layers**: Ralph implemented HTML5 drag-and-drop which can be janky on touch. May need to be replaced with pointer events for better mobile support in the mobile run.

---

## How to check progress

```bash
# See which branch is active and commits
git log --oneline -20

# Read progress
cat scripts/ralph/progress.txt

# Check if Ralph is still running
ps aux | grep "claude.*--print" | grep -v grep

# View PRD completion status
cat scripts/ralph/prd.json | jq '.userStories[] | {id, title, passes}'
```

## Branch summary
- `ralph/production-polish` — 20 stories (all done, previous run)
- `ralph/ux-visual-polish` — 12 stories (all done)
- `ralph/rich-text` — 13 stories (in progress or done)
- `ralph/slider-ux` — 12 stories (queued)
- `ralph/mobile-support` — 12 stories (queued)
