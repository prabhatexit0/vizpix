import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'
import type { Layer, LayerTransform, BlendMode } from '@/store/types'
import { decodeToBitmap, batchDecodeToBitmaps } from './canvas-utils'
import { blendModeMap } from './blend-modes'

interface VpdManifest {
  version: 1
  generator: string
  document: { width: number; height: number; background: string }
  layers: VpdLayerEntry[]
}

interface VpdLayerEntry {
  id: string
  type: 'image'
  name: string
  blob: string
  width: number
  height: number
  visible?: boolean
  locked?: boolean
  opacity?: number
  blendMode?: string
  transform?: Partial<LayerTransform>
}

export interface VpdLoadResult {
  manifest: VpdManifest
  layers: Layer[]
}

const THUMBNAIL_MAX = 256

function generateThumbnail(
  layers: Layer[],
  docWidth: number,
  docHeight: number,
  background: string,
): Promise<Uint8Array> {
  const scale = Math.min(THUMBNAIL_MAX / docWidth, THUMBNAIL_MAX / docHeight, 1)
  const w = Math.round(docWidth * scale)
  const h = Math.round(docHeight * scale)

  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = background
  ctx.fillRect(0, 0, w, h)
  ctx.translate(w / 2, h / 2)

  for (const layer of layers) {
    if (!layer.visible || !layer.imageBitmap) continue
    ctx.save()
    ctx.globalAlpha = layer.opacity
    ctx.globalCompositeOperation = blendModeMap[layer.blendMode]
    const { x, y, scaleX, scaleY, rotation } = layer.transform
    ctx.translate(x * scale, y * scale)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.scale(scaleX * scale, scaleY * scale)
    ctx.drawImage(layer.imageBitmap, -layer.width / 2, -layer.height / 2)
    ctx.restore()
  }

  return canvas.convertToBlob({ type: 'image/png' }).then(async (blob) => {
    return new Uint8Array(await blob.arrayBuffer())
  })
}

function triggerDownload(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/x-vizpix-document' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function saveVpd(
  layers: Layer[],
  docWidth: number,
  docHeight: number,
  docBg: string,
  activeLayerId: string | null,
  filename = 'project',
): Promise<void> {
  const manifest: VpdManifest = {
    version: 1,
    generator: 'vizpix',
    document: { width: docWidth, height: docHeight, background: docBg },
    layers: layers.map((l) => {
      const entry: VpdLayerEntry = {
        id: l.id,
        type: 'image',
        name: l.name,
        blob: `blobs/${l.id}.png`,
        width: l.width,
        height: l.height,
      }
      if (!l.visible) entry.visible = false
      if (l.locked) entry.locked = true
      if (l.opacity !== 1) entry.opacity = l.opacity
      if (l.blendMode !== 'normal') entry.blendMode = l.blendMode
      const t = l.transform
      if (t.x !== 0 || t.y !== 0 || t.scaleX !== 1 || t.scaleY !== 1 || t.rotation !== 0) {
        entry.transform = {}
        if (t.x !== 0) entry.transform.x = t.x
        if (t.y !== 0) entry.transform.y = t.y
        if (t.scaleX !== 1) entry.transform.scaleX = t.scaleX
        if (t.scaleY !== 1) entry.transform.scaleY = t.scaleY
        if (t.rotation !== 0) entry.transform.rotation = t.rotation
      }
      return entry
    }),
  }

  const files: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
  }

  for (const layer of layers) {
    files[`blobs/${layer.id}.png`] = layer.imageBytes
  }

  try {
    const thumbnail = await generateThumbnail(layers, docWidth, docHeight, docBg)
    files['thumbnail.png'] = thumbnail
  } catch {
    // Thumbnail is optional
  }

  const zipped = zipSync(files, { level: 0 })
  triggerDownload(zipped, `${filename}.vpd`)
}

export async function loadVpd(file: File): Promise<VpdLoadResult> {
  const buffer = await file.arrayBuffer()
  const unzipped = unzipSync(new Uint8Array(buffer))

  const manifestBytes = unzipped['manifest.json']
  if (!manifestBytes) throw new Error('Invalid VPD file: missing manifest.json')

  const manifest: VpdManifest = JSON.parse(strFromU8(manifestBytes))
  if (manifest.version !== 1) throw new Error(`Unsupported VPD version: ${manifest.version}`)

  // Validate all blobs exist
  for (const entry of manifest.layers) {
    if (!unzipped[entry.blob]) {
      throw new Error(`Missing blob: ${entry.blob}`)
    }
  }

  // Decode bitmaps
  const layerBytes = manifest.layers.map((entry) => unzipped[entry.blob])
  let bitmaps: ImageBitmap[]
  try {
    bitmaps = await batchDecodeToBitmaps(layerBytes)
  } catch {
    bitmaps = await Promise.all(layerBytes.map((b) => decodeToBitmap(b)))
  }

  const layers: Layer[] = manifest.layers.map((entry, i) => ({
    id: entry.id,
    name: entry.name,
    imageBytes: layerBytes[i],
    imageBitmap: bitmaps[i],
    width: entry.width,
    height: entry.height,
    visible: entry.visible ?? true,
    locked: entry.locked ?? false,
    opacity: entry.opacity ?? 1,
    blendMode: (entry.blendMode ?? 'normal') as BlendMode,
    transform: {
      x: entry.transform?.x ?? 0,
      y: entry.transform?.y ?? 0,
      scaleX: entry.transform?.scaleX ?? 1,
      scaleY: entry.transform?.scaleY ?? 1,
      rotation: entry.transform?.rotation ?? 0,
    },
  }))

  return { manifest, layers }
}
