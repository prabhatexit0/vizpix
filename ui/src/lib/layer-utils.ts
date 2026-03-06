import type { Layer, GroupLayer } from '@/store/types'
import { layoutTextRuns, type TextLine } from '@/lib/rich-text-utils'

export function findLayerById(layers: Layer[], id: string): Layer | null {
  for (const layer of layers) {
    if (layer.id === id) return layer
    if (layer.type === 'group') {
      const found = findLayerById(layer.children, id)
      if (found) return found
    }
  }
  return null
}

export function findLayerParent(
  layers: Layer[],
  id: string,
): { parent: Layer[]; index: number } | null {
  for (let i = 0; i < layers.length; i++) {
    if (layers[i].id === id) return { parent: layers, index: i }
    const layer = layers[i]
    if (layer.type === 'group') {
      const found = findLayerParent(layer.children, id)
      if (found) return found
    }
  }
  return null
}

export function updateLayerInTree(
  layers: Layer[],
  id: string,
  updater: (layer: Layer) => Layer,
): Layer[] {
  return layers.map((layer) => {
    if (layer.id === id) return updater(layer)
    if (layer.type === 'group') {
      const updated = updateLayerInTree(layer.children, id, updater)
      if (updated !== layer.children) return { ...layer, children: updated }
    }
    return layer
  })
}

export function removeLayerFromTree(layers: Layer[], id: string): Layer[] {
  const result: Layer[] = []
  for (const layer of layers) {
    if (layer.id === id) continue
    if (layer.type === 'group') {
      const children = removeLayerFromTree(layer.children, id)
      result.push({ ...layer, children })
    } else {
      result.push(layer)
    }
  }
  return result
}

export function flattenLayers(layers: Layer[]): Layer[] {
  const result: Layer[] = []
  for (const layer of layers) {
    result.push(layer)
    if (layer.type === 'group') {
      result.push(...flattenLayers(layer.children))
    }
  }
  return result
}

export function getLayerDimensions(layer: Layer): { width: number; height: number } {
  switch (layer.type) {
    case 'image':
    case 'shape':
      return { width: layer.width, height: layer.height }
    case 'text':
      return measureTextLayer(layer)
    case 'group':
      return getGroupBounds(layer)
  }
}

const TEXT_MIN_WIDTH = 100

function measureTextLayer(layer: Layer & { type: 'text' }): { width: number; height: number } {
  const minHeight = layer.fontSize * layer.lineHeight

  if (!layer.content) {
    return { width: TEXT_MIN_WIDTH, height: minHeight }
  }

  const layout = layoutTextRuns(layer)
  const totalHeight = getTotalHeight(layout)

  if (layer.boxWidth !== null) {
    return { width: layer.boxWidth, height: totalHeight }
  }

  const maxLineWidth = Math.max(0, ...layout.map((l) => l.width))
  return { width: Math.ceil(maxLineWidth), height: Math.ceil(totalHeight) }
}

function getTotalHeight(layout: TextLine[]): number {
  if (layout.length === 0) return 0
  const last = layout[layout.length - 1]
  return last.yOffset + last.lineHeight
}

function getGroupBounds(group: GroupLayer): { width: number; height: number } {
  if (group.children.length === 0) return { width: 0, height: 0 }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const child of group.children) {
    const dims = getLayerDimensions(child)
    const { x, y, scaleX, scaleY } = child.transform
    const hw = (dims.width * Math.abs(scaleX)) / 2
    const hh = (dims.height * Math.abs(scaleY)) / 2
    minX = Math.min(minX, x - hw)
    minY = Math.min(minY, y - hh)
    maxX = Math.max(maxX, x + hw)
    maxY = Math.max(maxY, y + hh)
  }

  return { width: maxX - minX, height: maxY - minY }
}

/**
 * Given a TextLayer and a cursor index, return the cursor position
 * in the layer's local coordinate space (same space renderTextLayer draws in).
 */
export function measureCursorPosition(
  layer: Layer & { type: 'text' },
  cursorIndex: number,
): { localX: number; localY: number; fontSize: number; lineHeight: number } {
  const layout = layoutTextRuns(layer)
  const totalHeight = getTotalHeight(layout)

  // Find which line the cursor is on
  let lineIdx = layout.length - 1
  for (let i = 0; i < layout.length; i++) {
    const nextStart = i + 1 < layout.length ? layout[i + 1].startOffset : Infinity
    if (cursorIndex < nextStart) {
      lineIdx = i
      break
    }
  }

  const line = layout[lineIdx]

  // Measure width of text before cursor within the line's segments
  const canvas = new OffscreenCanvas(1, 1)
  const ctx = canvas.getContext('2d')!
  let cursorW = 0
  let remaining = cursorIndex - line.startOffset
  let cursorFontSize = layer.fontSize

  for (const seg of line.segments) {
    if (remaining <= 0) {
      cursorFontSize = seg.fontSize
      break
    }
    cursorFontSize = seg.fontSize
    const charsInSeg = Math.min(remaining, seg.text.length)
    ctx.font = seg.font
    if ('letterSpacing' in ctx) {
      ;(ctx as CanvasRenderingContext2D).letterSpacing = `${seg.letterSpacing}px`
    }
    cursorW += ctx.measureText(seg.text.substring(0, charsInSeg)).width
    remaining -= charsInSeg
  }

  // textBlockWidth
  let textBlockWidth: number
  if (layer.boxWidth !== null) {
    textBlockWidth = layer.boxWidth
  } else {
    textBlockWidth = Math.max(0, ...layout.map((l) => l.width))
  }

  // X positioning based on alignment
  const lineW = line.width
  let localX: number
  if (layer.textAlign === 'left') {
    localX = -textBlockWidth / 2 + cursorW
  } else if (layer.textAlign === 'right') {
    localX = textBlockWidth / 2 - lineW + cursorW
  } else {
    localX = -lineW / 2 + cursorW
  }

  const yStart = -totalHeight / 2
  const localY = yStart + line.yOffset

  return { localX, localY, fontSize: cursorFontSize, lineHeight: line.lineHeight }
}

/**
 * Given a TextLayer and local coordinates (in layer's pre-scale space),
 * return the closest flat character index. Used for click-to-cursor.
 */
export function findCursorIndexFromLocal(
  layer: Layer & { type: 'text' },
  localX: number,
  localY: number,
): number {
  const layout = layoutTextRuns(layer)
  if (layout.length === 0) return 0

  const totalHeight = getTotalHeight(layout)
  const yStart = -totalHeight / 2

  // Find which line by Y position
  let lineIdx = layout.length - 1
  for (let i = 0; i < layout.length; i++) {
    if (localY < yStart + layout[i].yOffset + layout[i].lineHeight) {
      lineIdx = i
      break
    }
  }

  const line = layout[lineIdx]

  // textBlockWidth
  let textBlockWidth: number
  if (layer.boxWidth !== null) {
    textBlockWidth = layer.boxWidth
  } else {
    textBlockWidth = Math.max(0, ...layout.map((l) => l.width))
  }

  // Line start X in local space
  const lineW = line.width
  let lineStartX: number
  if (layer.textAlign === 'left') lineStartX = -textBlockWidth / 2
  else if (layer.textAlign === 'right') lineStartX = textBlockWidth / 2 - lineW
  else lineStartX = -lineW / 2

  // Walk through segments to find closest character boundary
  const canvas = new OffscreenCanvas(1, 1)
  const ctx = canvas.getContext('2d')!
  let bestOffset = line.startOffset
  let bestDist = Math.abs(localX - lineStartX)
  let x = lineStartX

  for (const seg of line.segments) {
    ctx.font = seg.font
    if ('letterSpacing' in ctx) {
      ;(ctx as CanvasRenderingContext2D).letterSpacing = `${seg.letterSpacing}px`
    }
    for (let i = 1; i <= seg.text.length; i++) {
      const w = ctx.measureText(seg.text.substring(0, i)).width
      const dist = Math.abs(localX - (x + w))
      if (dist < bestDist) {
        bestDist = dist
        bestOffset = seg.startOffset + i
      }
    }
    x += seg.width
  }

  return bestOffset
}

export interface SelectionRect {
  localX: number
  localY: number
  width: number
  height: number
}

export function getSelectionRects(
  layer: Layer & { type: 'text' },
  selStart: number,
  selEnd: number,
): SelectionRect[] {
  const layout = layoutTextRuns(layer)
  if (layout.length === 0) return []

  const totalHeight = getTotalHeight(layout)
  const yStart = -totalHeight / 2

  let textBlockWidth: number
  if (layer.boxWidth !== null) {
    textBlockWidth = layer.boxWidth
  } else {
    textBlockWidth = Math.max(0, ...layout.map((l) => l.width))
  }

  const canvas = new OffscreenCanvas(1, 1)
  const ctx = canvas.getContext('2d')!
  const rects: SelectionRect[] = []

  for (const line of layout) {
    const lineEnd = line.startOffset + line.segments.reduce((n, s) => n + s.text.length, 0)
    if (selStart >= lineEnd || selEnd <= line.startOffset) continue

    const lineW = line.width
    let lineStartX: number
    if (layer.textAlign === 'left') lineStartX = -textBlockWidth / 2
    else if (layer.textAlign === 'right') lineStartX = textBlockWidth / 2 - lineW
    else lineStartX = -lineW / 2

    // Measure x offset of selStart and selEnd within this line
    let x = lineStartX
    let x1 = lineStartX
    let x2 = lineStartX + lineW
    let foundStart = selStart <= line.startOffset
    let foundEnd = false

    for (const seg of line.segments) {
      ctx.font = seg.font
      if ('letterSpacing' in ctx) {
        ;(ctx as CanvasRenderingContext2D).letterSpacing = `${seg.letterSpacing}px`
      }

      const segEnd = seg.startOffset + seg.text.length

      if (!foundStart && selStart > seg.startOffset && selStart <= segEnd) {
        const chars = selStart - seg.startOffset
        x1 = x + ctx.measureText(seg.text.substring(0, chars)).width
        foundStart = true
      } else if (!foundStart && selStart <= seg.startOffset) {
        x1 = x
        foundStart = true
      }

      if (!foundEnd && selEnd >= seg.startOffset && selEnd <= segEnd) {
        const chars = selEnd - seg.startOffset
        x2 = x + ctx.measureText(seg.text.substring(0, chars)).width
        foundEnd = true
      }

      x += seg.width
    }

    if (!foundStart) x1 = lineStartX
    if (!foundEnd) x2 = x

    rects.push({
      localX: x1,
      localY: yStart + line.yOffset,
      width: x2 - x1,
      height: line.lineHeight,
    })
  }

  return rects
}

export { measureTextLayer }
