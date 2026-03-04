import type { BlendMode, Layer } from '@/store/types'
import { blendModeMap } from '@/lib/blend-modes'

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

  // Collect visible layers with bitmaps
  const visibleLayers = layers.filter((l) => l.visible && l.imageBitmap)

  // Extract raw pixels from each layer and build metadata
  const pixelArrays: Uint8Array[] = []
  const meta: number[] = []
  let totalPixelSize = 0

  for (const layer of visibleLayers) {
    const pixels = extractPixels(layer.imageBitmap!)
    const pixelOffset = totalPixelSize
    const pixelLength = pixels.length
    pixelArrays.push(pixels)
    totalPixelSize += pixelLength

    // 11 f64s per layer
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
  }

  // Pack all pixels into one buffer
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

  // fill background
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)

  // translate origin to center (matching compositor coordinate system)
  ctx.translate(width / 2, height / 2)

  // composite layers
  for (const layer of layers) {
    if (!layer.visible || !layer.imageBitmap) continue

    ctx.save()
    ctx.globalAlpha = layer.opacity
    ctx.globalCompositeOperation = blendModeMap[layer.blendMode]

    const { x, y, scaleX, scaleY, rotation } = layer.transform
    ctx.translate(x, y)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.scale(scaleX, scaleY)
    ctx.drawImage(layer.imageBitmap, -layer.width / 2, -layer.height / 2)

    ctx.restore()
  }

  // export to blob
  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg'
  const blob = await canvas.convertToBlob({
    type: mimeType,
    quality: format === 'jpeg' ? quality / 100 : undefined,
  })

  // trigger download
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
