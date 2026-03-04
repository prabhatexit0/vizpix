export interface HistogramData {
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
}

export async function computeHistogram(imageBytes: Uint8Array): Promise<HistogramData> {
  const { compute_histogram } = await import("@/wasm/vizpix-core/vizpix_core");
  const packed = compute_histogram(imageBytes);
  const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);

  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);

  for (let i = 0; i < 256; i++) {
    r[i] = view.getUint32(i * 4, true);
    g[i] = view.getUint32((256 + i) * 4, true);
    b[i] = view.getUint32((512 + i) * 4, true);
  }

  return { r, g, b };
}
