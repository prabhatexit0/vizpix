export async function decodeToBitmap(bytes: Uint8Array): Promise<ImageBitmap> {
  const blob = new Blob([bytes as BlobPart])
  return createImageBitmap(blob)
}

export async function decodeToBitmapFromRgba(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<ImageBitmap> {
  const imageData = new ImageData(new Uint8ClampedArray(data), width, height)
  return createImageBitmap(imageData)
}

export async function batchDecodeToBitmaps(layerBytes: Uint8Array[]): Promise<ImageBitmap[]> {
  const { default: init, decode_images_batch } = await import('@/wasm/vizpix-core/vizpix_core')
  await init()

  // Pack all image bytes into a single buffer with offsets/lengths
  let totalSize = 0
  for (const bytes of layerBytes) totalSize += bytes.length

  const packed = new Uint8Array(totalSize)
  const offsets = new Uint32Array(layerBytes.length)
  const lengths = new Uint32Array(layerBytes.length)

  let offset = 0
  for (let i = 0; i < layerBytes.length; i++) {
    packed.set(layerBytes[i], offset)
    offsets[i] = offset
    lengths[i] = layerBytes[i].length
    offset += layerBytes[i].length
  }

  const result = decode_images_batch(packed, offsets, lengths)

  // Parse result: [u32_le width, u32_le height, rgba_pixels, ...]
  const bitmaps: ImageBitmap[] = []
  let pos = 0
  const view = new DataView(result.buffer, result.byteOffset, result.byteLength)

  for (let i = 0; i < layerBytes.length; i++) {
    const w = view.getUint32(pos, true)
    pos += 4
    const h = view.getUint32(pos, true)
    pos += 4
    const pixelCount = w * h * 4
    const rgba = new Uint8ClampedArray(result.buffer, result.byteOffset + pos, pixelCount)
    pos += pixelCount
    bitmaps.push(await decodeToBitmapFromRgba(rgba, w, h))
  }

  return bitmaps
}
