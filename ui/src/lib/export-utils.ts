import type { BlendMode, Layer } from '@/store/types'
import { renderLayerToContext, rasterizeLayer } from '@/lib/layer-render'

export type ExportFormat = 'png' | 'jpeg'

export interface ExportOptions {
  format: ExportFormat
  quality: number // 1-100, only used for JPEG
  filename: string
  width: number
  height: number
  background: string
  layers: Layer[]
}

const blendModeIndex: Record<BlendMode, number> = {
  normal: 0,
  multiply: 1,
  screen: 2,
  overlay: 3,
  darken: 4,
  lighten: 5,
  'color-dodge': 6,
  'color-burn': 7,
  'hard-light': 8,
  'soft-light': 9,
  difference: 10,
  exclusion: 11,
}

function parseHexColor(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function extractPixels(bitmap: ImageBitmap): Uint8Array {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
  return new Uint8Array(imageData.data.buffer)
}

function triggerDownload(bytes: Uint8Array, filename: string, mimeType: string) {
  const blob = new Blob([bytes as BlobPart], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function exportCanvasWasm(options: ExportOptions): Promise<void> {
  const { format, quality, filename, width, height, background, layers } = options
  const { default: init, composite_and_export } = await import('@/wasm/vizpix-core/vizpix_core')
  await init()

  const [bgR, bgG, bgB] = parseHexColor(background)

  const visibleLayers = layers.filter((l) => l.visible)

  const pixelArrays: Uint8Array[] = []
  const meta: number[] = []
  let totalPixelSize = 0

  for (const layer of visibleLayers) {
    let pixels: Uint8Array

    if (layer.type === 'image' && layer.imageBitmap) {
      pixels = extractPixels(layer.imageBitmap)
    } else {
      const imageData = rasterizeLayer(layer, width, height)
      pixels = new Uint8Array(imageData.data.buffer)
    }

    const pixelOffset = totalPixelSize
    const pixelLength = pixels.length
    pixelArrays.push(pixels)
    totalPixelSize += pixelLength

    if (layer.type === 'image') {
      meta.push(
        layer.width,
        layer.height,
        layer.transform.x,
        layer.transform.y,
        layer.transform.scaleX,
        layer.transform.scaleY,
        layer.transform.rotation,
        layer.opacity,
        blendModeIndex[layer.blendMode],
        pixelOffset,
        pixelLength,
      )
    } else {
      meta.push(
        width,
        height,
        0,
        0,
        1,
        1,
        0,
        layer.opacity,
        blendModeIndex[layer.blendMode],
        pixelOffset,
        pixelLength,
      )
    }
  }

  const allPixels = new Uint8Array(totalPixelSize)
  let offset = 0
  for (const arr of pixelArrays) {
    allPixels.set(arr, offset)
    offset += arr.length
  }

  const result = composite_and_export(
    width,
    height,
    bgR,
    bgG,
    bgB,
    allPixels,
    new Float64Array(meta),
    format,
    quality,
  )

  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg'
  triggerDownload(result, `${filename}.${format}`, mimeType)
}

async function exportCanvasCanvas2D(options: ExportOptions): Promise<void> {
  const { format, quality, filename, width, height, background, layers } = options

  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to create offscreen canvas context')

  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)
  ctx.translate(width / 2, height / 2)

  for (const layer of layers) {
    renderLayerToContext(ctx, layer, width, height)
  }

  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg'
  const blob = await canvas.convertToBlob({
    type: mimeType,
    quality: format === 'jpeg' ? quality / 100 : undefined,
  })

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.${format}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function exportCanvas(options: ExportOptions): Promise<void> {
  try {
    await exportCanvasWasm(options)
  } catch {
    await exportCanvasCanvas2D(options)
  }
}
