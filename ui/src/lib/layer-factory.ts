import type { Layer } from '@/store/types'
import { decodeToBitmap } from './canvas-utils'

let layerCounter = 0

export function resetLayerCounter(to = 0) {
  layerCounter = to
}

export async function createLayer(
  bytes: Uint8Array,
  name?: string,
  maxWidth?: number,
  maxHeight?: number,
): Promise<Layer> {
  let finalBytes = bytes
  if (maxWidth && maxHeight) {
    try {
      const { resize_to_fit } = await import('@/wasm/vizpix-core/vizpix_core')
      finalBytes = resize_to_fit(bytes, maxWidth, maxHeight)
    } catch {
      // Fall back to original bytes
    }
  }
  const bitmap = await decodeToBitmap(finalBytes)
  layerCounter++
  return {
    id: crypto.randomUUID(),
    name: name ?? `Layer ${layerCounter}`,
    imageBytes: finalBytes,
    imageBitmap: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    visible: true,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    locked: false,
  }
}
