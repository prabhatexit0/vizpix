# WASM Optimization Opportunities

What's already in WASM: filters (grayscale, sepia, warm, cool, vintage), adjustments (brightness, contrast, saturation), rotate, crop, invert, decode, encode.

What's still in JS and worth moving.

---

## Tier 1 — High Impact

### Export Compositing

**Currently:** `export-utils.ts` uses Canvas 2D API — iterates all layers, applies blend modes via `globalCompositeOperation`, converts to blob with `canvas.convertToBlob()`.

**Problem:** For a 4K canvas with 10+ layers, this takes 800ms–2s. Each blend mode operation reads/writes the full pixel buffer. PNG encoding goes through the browser's generic encoder.

**WASM approach:**
- New function: `composite_and_export(layers_data, transforms, blend_modes, opacities, width, height, format, quality) -> Vec<u8>`
- Receive raw pixel buffers for each layer (not ImageBitmaps)
- Composite in Rust with manual blend mode math (multiply, screen, overlay, etc.)
- Apply affine transforms per layer
- Encode directly with the `image` crate (already a dependency)
- Return final PNG/JPEG bytes — skip the OffscreenCanvas entirely

**Expected speedup:** 3–5x for large exports. The `image` crate's PNG encoder is faster than the browser's for large buffers, and pixel compositing in Rust avoids the Canvas 2D overhead of repeated `drawImage` calls with blend modes.

**Complexity:** Medium. Need to port the 12 blend mode formulas to Rust (they're standard — just per-pixel math). Transform application is straightforward affine math.

---

### Batch Image Decoding (Undo/Redo)

**Currently:** `history-slice.ts` stores snapshots as serialized layer arrays (with raw `Uint8Array` bytes, no `ImageBitmap`). On undo/redo, `restoreLayers()` calls `decodeToBitmap()` on every layer — which creates a `Blob`, then calls `createImageBitmap()`.

**Problem:** Undoing with 10 layers = 10 sequential decode operations. Each `createImageBitmap()` is async but not truly parallel — the browser decoder is single-threaded. This causes a noticeable stutter (~500ms).

**WASM approach:**
- New function: `decode_images_batch(images: Vec<Vec<u8>>) -> Vec<RawPixelData>`
- Decode all images in a single WASM call
- Optionally use `rayon` for parallel decoding across images (WASM threads are supported in modern browsers)
- Return raw RGBA pixel buffers + dimensions
- JS side creates `ImageBitmap` from `ImageData` (faster than from Blob)

**Expected speedup:** 2–3x. Main win is decoding multiple images in one WASM call instead of N async round-trips.

**Complexity:** Low. The `decode_image` function already exists — just needs a batch wrapper.

---

## Tier 2 — Medium Impact

### Image Resize on Import

**Currently:** When a user adds a large image (e.g. 6000x4000 from a camera), it's stored at full resolution. The canvas renders it scaled down via `drawImage`, but the full pixel buffer stays in memory and gets serialized into undo history.

**WASM approach:**
- New function: `resize_to_fit(bytes, max_width, max_height) -> Vec<u8>`
- On import, if the image exceeds document dimensions by 2x+, downscale it
- Use Lanczos3 resampling (available in the `image` crate)
- Reduces memory usage and speeds up all downstream operations

**Expected benefit:** Reduces memory 4–16x for oversized imports. Faster undo/redo, faster export.

**Complexity:** Low. The `image` crate has `resize()` built in.

---

### Gaussian Blur / Box Blur

**Currently:** Not implemented. Blur is a commonly requested image editing operation.

**WASM approach:**
- New function: `apply_blur(bytes, radius, blur_type) -> Vec<u8>`
- Box blur is O(width × height) with sliding window — very fast in Rust
- Gaussian blur with separable kernel is O(width × height × radius) — worth WASM for radius > 3

**Complexity:** Low. Well-known algorithms, trivial to implement.

---

### Sharpen / Unsharp Mask

**Currently:** Not implemented.

**WASM approach:**
- New function: `apply_sharpen(bytes, amount, radius, threshold) -> Vec<u8>`
- Unsharp mask = original + amount × (original - blurred)
- Builds on blur implementation

**Complexity:** Low (once blur exists).

---

## Tier 3 — Nice to Have

### Histogram Computation

- `compute_histogram(bytes) -> [u32; 256 * 3]` (R, G, B channels)
- Useful for levels/curves UI, auto-adjust
- Pure pixel iteration — fast in Rust, wasteful in JS

### Color Quantization

- `quantize_colors(bytes, num_colors) -> Vec<u8>`
- Median-cut or k-means in Rust
- Useful for palette extraction, posterize filter, GIF export prep

### Pixel-Perfect Hit Testing

- `hit_test(layers_pixel_data, x, y) -> Option<layer_index>`
- Check actual pixel alpha instead of bounding box
- Current JS hit test uses AABB — transparent areas still "hit"

---

## What to NOT Move to WASM

| Operation | Why Keep in JS |
|-----------|---------------|
| Viewport rendering | Canvas 2D is hardware-accelerated, runs at 60fps fine |
| Checkerboard pattern | Generated once, cached, trivial |
| Hit testing (AABB) | <1ms per call, pure math |
| UI interactions | Pointer events, DOM — no pixel work |
| Blend mode mapping | Static lookup table, no computation |

---

## Implementation Notes

Existing WASM bridge pattern (works well, keep using it):

```rust
#[wasm_bindgen]
pub fn new_function(input_bytes: &[u8], param: f32) -> Vec<u8> {
    let img = image::load_from_memory(input_bytes).unwrap();
    // ... process ...
    let mut buf = Vec::new();
    img.write_to(&mut Cursor::new(&mut buf), ImageFormat::Png).unwrap();
    buf
}
```

```typescript
const { new_function } = await import("@/wasm/vizpix-core/vizpix_core");
const result = new_function(layer.imageBytes, 0.5);
await applyWasmToLayer(layerId, result);
```

Start with Tier 1 (export compositing + batch decode) — they touch the most painful user-facing latency.
