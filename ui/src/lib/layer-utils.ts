import type { Layer, GroupLayer } from '@/store/types'

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

function measureTextLayer(layer: Layer & { type: 'text' }): { width: number; height: number } {
  const canvas = new OffscreenCanvas(1, 1)
  const ctx = canvas.getContext('2d')!
  ctx.font = `${layer.fontStyle} ${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`
  if ('letterSpacing' in ctx) {
    ;(ctx as unknown as CanvasRenderingContext2D).letterSpacing = `${layer.letterSpacing}px`
  }

  if (layer.maxWidth !== null) {
    const lines = wrapText(ctx, layer.content, layer.maxWidth)
    const lineH = layer.fontSize * layer.lineHeight
    return { width: layer.maxWidth, height: lines.length * lineH }
  }

  const lines = layer.content.split('\n')
  const lineH = layer.fontSize * layer.lineHeight
  const maxLineWidth = Math.max(...lines.map((l) => ctx.measureText(l).width))
  return { width: Math.ceil(maxLineWidth), height: Math.ceil(lines.length * lineH) }
}

function wrapText(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const paragraphs = text.split('\n')
  const lines: string[] = []
  for (const para of paragraphs) {
    const words = para.split(' ')
    let line = ''
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word
      if (ctx.measureText(testLine).width > maxWidth && line) {
        lines.push(line)
        line = word
      } else {
        line = testLine
      }
    }
    lines.push(line)
  }
  return lines
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

/** Set up a measurement context identical to renderTextLayer's font config. */
function createTextMeasureCtx(layer: Layer & { type: 'text' }): OffscreenCanvasRenderingContext2D {
  const canvas = new OffscreenCanvas(1, 1)
  const ctx = canvas.getContext('2d')!
  ctx.font = `${layer.fontStyle} ${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`
  ctx.textAlign = layer.textAlign
  ctx.textBaseline = 'top'
  if ('letterSpacing' in ctx) {
    ;(ctx as unknown as CanvasRenderingContext2D).letterSpacing = `${layer.letterSpacing}px`
  }
  return ctx
}

/** Split text into lines with character offset tracking (for cursor mapping). */
function splitLinesWithOffsets(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: string,
  maxWidth: number | null,
): Array<{ text: string; startOffset: number }> {
  if (maxWidth !== null) {
    const paragraphs = content.split('\n')
    const result: Array<{ text: string; startOffset: number }> = []
    let offset = 0
    for (const para of paragraphs) {
      const words = para.split(' ')
      let line = ''
      let lineStart = offset
      for (const word of words) {
        const testLine = line ? `${line} ${word}` : word
        if (ctx.measureText(testLine).width > maxWidth && line) {
          result.push({ text: line, startOffset: lineStart })
          lineStart = lineStart + line.length + 1
          line = word
        } else {
          line = testLine
        }
      }
      result.push({ text: line, startOffset: lineStart })
      offset += para.length + 1
    }
    return result
  }

  const lines = content.split('\n')
  let offset = 0
  return lines.map((text) => {
    const entry = { text, startOffset: offset }
    offset += text.length + 1
    return entry
  })
}

/**
 * Given a TextLayer and a cursor index, return the cursor position
 * in the layer's local coordinate space (same space renderTextLayer draws in).
 * The returned localX/localY are in pre-scale layer coords.
 */
export function measureCursorPosition(
  layer: Layer & { type: 'text' },
  cursorIndex: number,
): { localX: number; localY: number } {
  const ctx = createTextMeasureCtx(layer)
  const lineEntries = splitLinesWithOffsets(ctx, layer.content, layer.maxWidth)

  const lineH = layer.fontSize * layer.lineHeight
  const totalHeight = lineEntries.length * lineH

  // Find which line the cursor is on
  let lineIdx = lineEntries.length - 1
  for (let i = 0; i < lineEntries.length; i++) {
    const nextStart = i + 1 < lineEntries.length ? lineEntries[i + 1].startOffset : Infinity
    if (cursorIndex < nextStart) {
      lineIdx = i
      break
    }
  }

  const entry = lineEntries[lineIdx]
  const col = Math.min(cursorIndex - entry.startOffset, entry.text.length)
  const textBeforeCursor = entry.text.substring(0, col)

  // Measure width of text before cursor
  const cursorW = ctx.measureText(textBeforeCursor).width

  // Compute textBlockWidth (same as renderTextLayer)
  let textBlockWidth: number
  if (layer.maxWidth !== null) {
    textBlockWidth = layer.maxWidth
  } else {
    textBlockWidth = Math.max(...lineEntries.map((e) => ctx.measureText(e.text).width))
    if (!isFinite(textBlockWidth)) textBlockWidth = 0
  }

  // X offset based on alignment (same as renderTextLayer)
  let xOffset: number
  if (layer.textAlign === 'left') xOffset = -textBlockWidth / 2
  else if (layer.textAlign === 'right') xOffset = textBlockWidth / 2
  else xOffset = 0

  // For cursor positioning, we need the left edge of the character position.
  // With textAlign='left', fillText starts at xOffset, so cursor is at xOffset + cursorW.
  // With textAlign='center', fillText centers at xOffset (0), so cursor is at -lineW/2 + cursorW.
  // With textAlign='right', fillText ends at xOffset, so cursor is at xOffset - lineW + cursorW.
  const lineW = ctx.measureText(entry.text).width
  let localX: number
  if (layer.textAlign === 'left') {
    localX = xOffset + cursorW
  } else if (layer.textAlign === 'right') {
    localX = xOffset - lineW + cursorW
  } else {
    localX = -lineW / 2 + cursorW
  }

  const yStart = -totalHeight / 2
  const localY = yStart + lineIdx * lineH

  return { localX, localY }
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
  const ctx = createTextMeasureCtx(layer)
  const lineEntries = splitLinesWithOffsets(ctx, layer.content, layer.maxWidth)

  if (lineEntries.length === 0) return 0

  const lineH = layer.fontSize * layer.lineHeight
  const totalHeight = lineEntries.length * lineH
  const yStart = -totalHeight / 2

  // Determine which line
  let lineIdx = Math.floor((localY - yStart) / lineH)
  lineIdx = Math.max(0, Math.min(lineIdx, lineEntries.length - 1))

  const entry = lineEntries[lineIdx]

  // Compute textBlockWidth
  let textBlockWidth: number
  if (layer.maxWidth !== null) {
    textBlockWidth = layer.maxWidth
  } else {
    textBlockWidth = Math.max(...lineEntries.map((e) => ctx.measureText(e.text).width))
    if (!isFinite(textBlockWidth)) textBlockWidth = 0
  }

  // X offset based on alignment
  let xOffset: number
  if (layer.textAlign === 'left') xOffset = -textBlockWidth / 2
  else if (layer.textAlign === 'right') xOffset = textBlockWidth / 2
  else xOffset = 0

  // Compute line start X in local space
  const lineW = ctx.measureText(entry.text).width
  let lineStartX: number
  if (layer.textAlign === 'left') lineStartX = xOffset
  else if (layer.textAlign === 'right') lineStartX = xOffset - lineW
  else lineStartX = -lineW / 2

  // Find closest character boundary
  let bestCol = 0
  let bestDist = Math.abs(localX - lineStartX)
  for (let i = 1; i <= entry.text.length; i++) {
    const w = ctx.measureText(entry.text.substring(0, i)).width
    const dist = Math.abs(localX - (lineStartX + w))
    if (dist < bestDist) {
      bestDist = dist
      bestCol = i
    }
  }

  return entry.startOffset + bestCol
}

export { wrapText, measureTextLayer }
