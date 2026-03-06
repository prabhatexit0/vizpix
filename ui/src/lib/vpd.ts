import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'
import type {
  Layer,
  ImageLayer,
  ShapeLayer,
  TextLayer,
  GroupLayer,
  LayerTransform,
  BlendMode,
  LayerMask,
} from '@/store/types'
import { decodeToBitmap } from './canvas-utils'
import { renderLayerToContext } from './layer-render'

interface VpdManifest {
  version: 1
  generator: string
  document: { width: number; height: number; background: string }
  layers: VpdLayerEntry[]
}

type VpdLayerEntry = VpdImageEntry | VpdShapeEntry | VpdTextEntry | VpdGroupEntry

interface VpdLayerBase {
  id: string
  type: string
  name: string
  visible?: boolean
  locked?: boolean
  opacity?: number
  blendMode?: string
  transform?: Partial<LayerTransform>
  mask?: { blob: string; inverted: boolean }
}

interface VpdImageEntry extends VpdLayerBase {
  type: 'image'
  blob: string
  originalBlob?: string
  width: number
  height: number
}

interface VpdShapeEntry extends VpdLayerBase {
  type: 'shape'
  shapeType: string
  width: number
  height: number
  fill?: unknown
  stroke?: unknown
  cornerRadius?: number
  points?: { x: number; y: number }[]
}

interface VpdTextEntry extends VpdLayerBase {
  type: 'text'
  content: string
  fontFamily: string
  fontSize: number
  fontWeight?: number
  fontStyle?: string
  fill?: unknown
  textAlign?: string
  lineHeight?: number
  letterSpacing?: number
  boxWidth?: number | null
  boxHeight?: number | 'auto'
  maxWidth?: number | null
}

interface VpdGroupEntry extends VpdLayerBase {
  type: 'group'
  children: VpdLayerEntry[]
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
  ctx.scale(scale, scale)

  for (const layer of layers) {
    renderLayerToContext(ctx, layer, docWidth, docHeight, true)
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

// --- Save ---

function serializeTransform(t: LayerTransform): Partial<LayerTransform> | undefined {
  if (t.x === 0 && t.y === 0 && t.scaleX === 1 && t.scaleY === 1 && t.rotation === 0)
    return undefined
  const result: Partial<LayerTransform> = {}
  if (t.x !== 0) result.x = t.x
  if (t.y !== 0) result.y = t.y
  if (t.scaleX !== 1) result.scaleX = t.scaleX
  if (t.scaleY !== 1) result.scaleY = t.scaleY
  if (t.rotation !== 0) result.rotation = t.rotation
  return result
}

function serializeLayerBase(l: Layer): Partial<Omit<VpdLayerBase, 'id' | 'type' | 'name'>> {
  const entry: Partial<Omit<VpdLayerBase, 'id' | 'type' | 'name'>> = {}
  if (!l.visible) entry.visible = false
  if (l.locked) entry.locked = true
  if (l.opacity !== 1) entry.opacity = l.opacity
  if (l.blendMode !== 'normal') entry.blendMode = l.blendMode
  const t = serializeTransform(l.transform)
  if (t) entry.transform = t
  return entry
}

function serializeLayer(l: Layer, files: Record<string, Uint8Array>): VpdLayerEntry {
  const base = serializeLayerBase(l)

  if (l.mask) {
    const maskBlobPath = `blobs/mask-${l.id}.png`
    files[maskBlobPath] = l.mask.imageBytes
    base.mask = { blob: maskBlobPath, inverted: l.mask.inverted }
  }

  switch (l.type) {
    case 'image': {
      files[`blobs/${l.id}.png`] = l.imageBytes
      const entry: VpdImageEntry = {
        id: l.id,
        type: 'image',
        name: l.name,
        blob: `blobs/${l.id}.png`,
        width: l.width,
        height: l.height,
        ...base,
      }
      if (l.originalBytes !== l.imageBytes) {
        const origPath = `blobs/orig-${l.id}.png`
        files[origPath] = l.originalBytes
        entry.originalBlob = origPath
      }
      return entry
    }
    case 'shape': {
      const entry: VpdShapeEntry = {
        id: l.id,
        type: 'shape',
        name: l.name,
        shapeType: l.shapeType,
        width: l.width,
        height: l.height,
        ...base,
      }
      const defaultFill = { type: 'solid', color: '#3b82f6' }
      if (JSON.stringify(l.fill) !== JSON.stringify(defaultFill)) entry.fill = l.fill
      if (l.stroke.width !== 0 || l.stroke.color !== '#000000' || l.stroke.alignment !== 'center') {
        entry.stroke = l.stroke
      }
      if (l.cornerRadius !== 0) entry.cornerRadius = l.cornerRadius
      if (l.points.length > 0) entry.points = l.points
      return entry
    }
    case 'text': {
      const entry: VpdTextEntry = {
        id: l.id,
        type: 'text',
        name: l.name,
        content: l.content,
        fontFamily: l.fontFamily,
        fontSize: l.fontSize,
        ...base,
      }
      if (l.fontWeight !== 400) entry.fontWeight = l.fontWeight
      if (l.fontStyle !== 'normal') entry.fontStyle = l.fontStyle
      const defaultFill = { type: 'solid', color: '#ffffff' }
      if (JSON.stringify(l.fill) !== JSON.stringify(defaultFill)) entry.fill = l.fill
      if (l.textAlign !== 'left') entry.textAlign = l.textAlign
      if (l.lineHeight !== 1.4) entry.lineHeight = l.lineHeight
      if (l.letterSpacing !== 0) entry.letterSpacing = l.letterSpacing
      if (l.boxWidth !== null) entry.boxWidth = l.boxWidth
      if (l.boxHeight !== 'auto') entry.boxHeight = l.boxHeight
      return entry
    }
    case 'group': {
      return {
        id: l.id,
        type: 'group',
        name: l.name,
        children: l.children.map((c) => serializeLayer(c, files)),
        ...base,
      } as VpdGroupEntry
    }
  }
}

export async function saveVpd(
  layers: Layer[],
  docWidth: number,
  docHeight: number,
  docBg: string,
  filename = 'project',
): Promise<void> {
  const files: Record<string, Uint8Array> = {}

  const manifest: VpdManifest = {
    version: 1,
    generator: 'vizpix',
    document: { width: docWidth, height: docHeight, background: docBg },
    layers: layers.map((l) => serializeLayer(l, files)),
  }

  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2))

  try {
    const thumbnail = await generateThumbnail(layers, docWidth, docHeight, docBg)
    files['thumbnail.png'] = thumbnail
  } catch {
    // Thumbnail is optional
  }

  const zipped = zipSync(files, { level: 0 })
  triggerDownload(zipped, `${filename}.vpd`)
}

// --- Load ---

function deserializeTransform(t?: Partial<LayerTransform>): LayerTransform {
  return {
    x: t?.x ?? 0,
    y: t?.y ?? 0,
    scaleX: t?.scaleX ?? 1,
    scaleY: t?.scaleY ?? 1,
    rotation: t?.rotation ?? 0,
  }
}

async function deserializeMask(
  maskEntry: { blob: string; inverted: boolean } | undefined,
  unzipped: Record<string, Uint8Array>,
): Promise<LayerMask | undefined> {
  if (!maskEntry) return undefined
  const maskBytes = unzipped[maskEntry.blob]
  if (!maskBytes) return undefined
  const bitmap = await decodeToBitmap(maskBytes)
  return {
    imageBytes: maskBytes,
    imageBitmap: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    inverted: maskEntry.inverted,
  }
}

async function deserializeLayer(
  entry: VpdLayerEntry,
  unzipped: Record<string, Uint8Array>,
): Promise<Layer | null> {
  const base = {
    id: entry.id,
    name: entry.name,
    visible: entry.visible ?? true,
    locked: entry.locked ?? false,
    opacity: entry.opacity ?? 1,
    blendMode: (entry.blendMode ?? 'normal') as BlendMode,
    transform: deserializeTransform(entry.transform),
    mask: await deserializeMask(entry.mask, unzipped),
  }

  switch (entry.type) {
    case 'image': {
      const imgEntry = entry as VpdImageEntry
      const bytes = unzipped[imgEntry.blob]
      if (!bytes) return null
      const bitmap = await decodeToBitmap(bytes)
      const originalBytes = imgEntry.originalBlob
        ? (unzipped[imgEntry.originalBlob] ?? bytes)
        : bytes
      return {
        ...base,
        type: 'image',
        imageBytes: bytes,
        originalBytes,
        imageBitmap: bitmap,
        width: imgEntry.width,
        height: imgEntry.height,
      } as ImageLayer
    }
    case 'shape': {
      const shpEntry = entry as VpdShapeEntry
      const defaultFill = { type: 'solid' as const, color: '#3b82f6' }
      const defaultStroke = { color: '#000000', width: 0, alignment: 'center' as const }
      return {
        ...base,
        type: 'shape',
        shapeType: shpEntry.shapeType,
        width: shpEntry.width,
        height: shpEntry.height,
        fill: (shpEntry.fill ?? defaultFill) as ShapeLayer['fill'],
        stroke: (shpEntry.stroke ?? defaultStroke) as ShapeLayer['stroke'],
        cornerRadius: shpEntry.cornerRadius ?? 0,
        points: shpEntry.points ?? [],
      } as ShapeLayer
    }
    case 'text': {
      const txtEntry = entry as VpdTextEntry
      const defaultFill = { type: 'solid' as const, color: '#ffffff' }
      return {
        ...base,
        type: 'text',
        content: txtEntry.content,
        fontFamily: txtEntry.fontFamily,
        fontSize: txtEntry.fontSize,
        fontWeight: (txtEntry.fontWeight ?? 400) as TextLayer['fontWeight'],
        fontStyle: (txtEntry.fontStyle ?? 'normal') as TextLayer['fontStyle'],
        fill: (txtEntry.fill ?? defaultFill) as TextLayer['fill'],
        textAlign: (txtEntry.textAlign ?? 'left') as TextLayer['textAlign'],
        lineHeight: txtEntry.lineHeight ?? 1.4,
        letterSpacing: txtEntry.letterSpacing ?? 0,
        boxWidth: txtEntry.boxWidth ?? txtEntry.maxWidth ?? null,
        boxHeight: txtEntry.boxHeight ?? 'auto',
      } as TextLayer
    }
    case 'group': {
      const grpEntry = entry as VpdGroupEntry
      const children = await Promise.all(
        grpEntry.children.map((c) => deserializeLayer(c, unzipped)),
      )
      return {
        ...base,
        type: 'group',
        children: children.filter((c): c is Layer => c !== null),
        expanded: true,
      } as GroupLayer
    }
    default:
      return null
  }
}

export async function loadVpd(file: File): Promise<VpdLoadResult> {
  const buffer = await file.arrayBuffer()
  const unzipped = unzipSync(new Uint8Array(buffer))

  const manifestBytes = unzipped['manifest.json']
  if (!manifestBytes) throw new Error('Invalid VPD file: missing manifest.json')

  const manifest: VpdManifest = JSON.parse(strFromU8(manifestBytes))
  if (manifest.version !== 1) throw new Error(`Unsupported VPD version: ${manifest.version}`)

  const layers = await Promise.all(
    manifest.layers.map((entry) => deserializeLayer(entry, unzipped)),
  )

  return {
    manifest,
    layers: layers.filter((l): l is Layer => l !== null),
  }
}
