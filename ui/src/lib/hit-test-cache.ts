const alphaCache = new Map<
  string,
  { data: Uint8ClampedArray; bytesRef: Uint8Array; width: number; height: number }
>();

export function getAlphaCache(
  layerId: string,
  imageBytes: Uint8Array,
  bitmap: ImageBitmap | null,
  w: number,
  h: number,
): { data: Uint8ClampedArray; width: number; height: number } | null {
  const cached = alphaCache.get(layerId);
  if (cached && cached.bytesRef === imageBytes) {
    return { data: cached.data, width: cached.width, height: cached.height };
  }

  if (!bitmap) return null;

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(bitmap, 0, 0);
  const imgData = ctx.getImageData(0, 0, w, h);

  // Extract only alpha channel
  const alpha = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) {
    alpha[i] = imgData.data[i * 4 + 3];
  }

  alphaCache.set(layerId, { data: alpha, bytesRef: imageBytes, width: w, height: h });
  return { data: alpha, width: w, height: h };
}

export function invalidateAlphaCache(layerId: string): void {
  alphaCache.delete(layerId);
}
