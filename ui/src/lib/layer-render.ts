import type { Layer, ImageLayer, ShapeLayer, TextLayer, GroupLayer, Fill } from '@/store/types'
import { blendModeMap } from './blend-modes'
import { layoutTextRuns, type TextLine } from './rich-text-utils'

export function renderLayerToContext(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layer: Layer,
  docWidth: number,
  docHeight: number,
  isExport = false,
): void {
  if (!layer.visible) return

  // If layer has a mask, render via temp canvas
  if (layer.mask?.imageBitmap) {
    renderWithMask(ctx, layer, docWidth, docHeight, isExport)
    return
  }

  ctx.save()
  ctx.globalAlpha = layer.opacity
  ctx.globalCompositeOperation = blendModeMap[layer.blendMode]

  const { x, y, scaleX, scaleY, rotation } = layer.transform
  ctx.translate(x, y)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.scale(scaleX, scaleY)

  switch (layer.type) {
    case 'image':
      renderImageLayer(ctx, layer)
      break
    case 'shape':
      renderShapeLayer(ctx, layer)
      break
    case 'text':
      renderTextLayer(ctx, layer, isExport)
      break
    case 'group':
      renderGroupLayer(ctx, layer, docWidth, docHeight, isExport)
      break
  }

  ctx.restore()
}

function renderWithMask(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layer: Layer,
  docWidth: number,
  docHeight: number,
  isExport = false,
): void {
  const mask = layer.mask!
  const temp = new OffscreenCanvas(docWidth, docHeight)
  const tctx = temp.getContext('2d')!

  // Render layer content at its position within the temp canvas
  tctx.translate(docWidth / 2, docHeight / 2)

  const { x, y, scaleX, scaleY, rotation } = layer.transform
  tctx.translate(x, y)
  tctx.rotate((rotation * Math.PI) / 180)
  tctx.scale(scaleX, scaleY)

  switch (layer.type) {
    case 'image':
      renderImageLayer(tctx, layer)
      break
    case 'shape':
      renderShapeLayer(tctx, layer)
      break
    case 'text':
      renderTextLayer(tctx, layer, isExport)
      break
    case 'group':
      // Reset transform for group children since they manage their own
      tctx.setTransform(1, 0, 0, 1, docWidth / 2, docHeight / 2)
      tctx.translate(x, y)
      tctx.rotate((rotation * Math.PI) / 180)
      tctx.scale(scaleX, scaleY)
      renderGroupChildren(tctx, layer, docWidth, docHeight, isExport)
      break
  }

  // Apply mask
  tctx.setTransform(1, 0, 0, 1, 0, 0)
  tctx.globalCompositeOperation = mask.inverted ? 'destination-out' : 'destination-in'
  // Draw mask centered in document
  tctx.drawImage(mask.imageBitmap!, docWidth / 2 - mask.width / 2, docHeight / 2 - mask.height / 2)

  // Draw temp canvas onto main canvas
  ctx.save()
  ctx.globalAlpha = layer.opacity
  ctx.globalCompositeOperation = blendModeMap[layer.blendMode]
  ctx.drawImage(temp, -docWidth / 2, -docHeight / 2)
  ctx.restore()
}

function renderImageLayer(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layer: ImageLayer,
): void {
  if (!layer.imageBitmap) return
  ctx.drawImage(layer.imageBitmap, -layer.width / 2, -layer.height / 2)
}

function renderShapeLayer(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layer: ShapeLayer,
): void {
  const { width, height, shapeType, fill, stroke, cornerRadius, points } = layer
  const hw = width / 2
  const hh = height / 2

  // Build path
  ctx.beginPath()
  switch (shapeType) {
    case 'rectangle':
      if (cornerRadius > 0) {
        ctx.roundRect(-hw, -hh, width, height, cornerRadius)
      } else {
        ctx.rect(-hw, -hh, width, height)
      }
      break
    case 'ellipse':
      ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2)
      break
    case 'line':
      ctx.moveTo(-hw, 0)
      ctx.lineTo(hw, 0)
      break
    case 'polygon':
      if (points.length > 0) {
        ctx.moveTo(points[0].x, points[0].y)
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y)
        }
        ctx.closePath()
      }
      break
  }

  // Fill (not for lines)
  if (shapeType !== 'line' && fill.type !== 'none') {
    ctx.fillStyle = createFillStyle(ctx, fill, width, height)
    ctx.fill()
  }

  // Stroke
  if (stroke.width > 0) {
    ctx.strokeStyle = stroke.color
    ctx.lineWidth = stroke.width

    if (stroke.alignment === 'center') {
      ctx.stroke()
    } else if (stroke.alignment === 'inside') {
      ctx.save()
      ctx.clip()
      ctx.lineWidth = stroke.width * 2
      ctx.stroke()
      ctx.restore()
    } else {
      // outside
      ctx.save()
      // Clip to inverse: fill entire canvas, then cut out the path
      ctx.clip('evenodd')
      ctx.lineWidth = stroke.width * 2
      ctx.stroke()
      ctx.restore()
    }
  }
}

function renderDecoration(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  decoration: 'underline' | 'strikethrough',
  x: number,
  y: number,
  width: number,
  fontSize: number,
): void {
  const thickness = Math.max(1, fontSize / 16)
  const dy = decoration === 'underline' ? y + fontSize * 0.9 : y + fontSize * 0.35
  ctx.fillRect(x, dy, width, thickness)
}

function getLayoutTotalHeight(layout: TextLine[]): number {
  if (layout.length === 0) return 0
  const last = layout[layout.length - 1]
  return last.yOffset + last.lineHeight
}

function renderTextLayer(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layer: TextLayer,
  isExport = false,
): void {
  const { fontSize, fill, textAlign, lineHeight } = layer
  const content = layer.runs.map((r) => r.text).join('')

  if (!content && !isExport) {
    const minW = 100
    const minH = fontSize * lineHeight
    const fillColor = fill.type === 'solid' ? fill.color : '#888888'
    ctx.save()
    ctx.globalAlpha = 0.5
    ctx.strokeStyle = fillColor
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.strokeRect(-minW / 2, -minH / 2, minW, minH)
    ctx.restore()
    return
  }

  if (!content) return

  const layout = layoutTextRuns(layer)
  const totalHeight = getLayoutTotalHeight(layout)
  const textBlockWidth = layer.boxWidth ?? Math.max(0, ...layout.map((l) => l.width))
  const yStart = -totalHeight / 2

  ctx.textBaseline = 'top'
  const useGradient = fill.type !== 'none' && fill.type !== 'solid'

  if (useGradient) {
    const tw = Math.ceil(textBlockWidth) + 4
    const th = Math.ceil(totalHeight) + 4
    if (tw <= 0 || th <= 0) return
    const temp = new OffscreenCanvas(tw, th)
    const tctx = temp.getContext('2d')!
    tctx.textBaseline = 'top'
    tctx.textAlign = 'left'
    tctx.fillStyle = 'white'

    for (const line of layout) {
      const x0 =
        textAlign === 'left'
          ? 2
          : textAlign === 'right'
            ? tw - 2 - line.width
            : (tw - line.width) / 2
      let x = x0
      for (const seg of line.segments) {
        tctx.font = seg.font
        if ('letterSpacing' in tctx) {
          ;(tctx as unknown as CanvasRenderingContext2D).letterSpacing = `${seg.letterSpacing}px`
        }
        tctx.fillText(seg.text, x, 2 + line.yOffset)
        const dec = seg.run.textDecoration
        if (dec && dec !== 'none') {
          renderDecoration(tctx, dec, x, 2 + line.yOffset, seg.width, seg.fontSize)
        }
        x += seg.width
      }
    }

    tctx.globalCompositeOperation = 'source-in'
    tctx.fillStyle = createFillStyle(tctx, fill, tw, th)
    tctx.fillRect(0, 0, tw, th)
    ctx.drawImage(temp, -tw / 2, yStart - 2)
  } else {
    ctx.textAlign = 'left'

    for (const line of layout) {
      const x0 =
        textAlign === 'left'
          ? -textBlockWidth / 2
          : textAlign === 'right'
            ? textBlockWidth / 2 - line.width
            : -line.width / 2
      let x = x0
      for (const seg of line.segments) {
        ctx.font = seg.font
        if ('letterSpacing' in ctx) {
          ;(ctx as CanvasRenderingContext2D).letterSpacing = `${seg.letterSpacing}px`
        }
        const segFill = seg.run.fill ?? fill
        if (segFill.type === 'solid') {
          ctx.fillStyle = segFill.color
        } else if (segFill.type === 'none') {
          x += seg.width
          continue
        } else {
          ctx.fillStyle = '#ffffff'
        }
        ctx.fillText(seg.text, x, yStart + line.yOffset)
        const dec = seg.run.textDecoration
        if (dec && dec !== 'none') {
          renderDecoration(ctx, dec, x, yStart + line.yOffset, seg.width, seg.fontSize)
        }
        x += seg.width
      }
    }
  }
}

function renderGroupLayer(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  group: GroupLayer,
  docWidth: number,
  docHeight: number,
  isExport = false,
): void {
  // Passthrough optimization: if opacity 1, normal blend, no mask, render children directly
  if (group.opacity === 1 && group.blendMode === 'normal' && !group.mask) {
    renderGroupChildren(ctx, group, docWidth, docHeight, isExport)
    return
  }

  // Otherwise composite to temp canvas
  const temp = new OffscreenCanvas(docWidth, docHeight)
  const tctx = temp.getContext('2d')!
  tctx.translate(docWidth / 2, docHeight / 2)

  for (const child of group.children) {
    renderLayerToContext(tctx, child, docWidth, docHeight, isExport)
  }

  // If group has mask, apply it
  if (group.mask?.imageBitmap) {
    tctx.setTransform(1, 0, 0, 1, 0, 0)
    tctx.globalCompositeOperation = group.mask.inverted ? 'destination-out' : 'destination-in'
    tctx.drawImage(
      group.mask.imageBitmap,
      docWidth / 2 - group.mask.width / 2,
      docHeight / 2 - group.mask.height / 2,
    )
  }

  // Undo the parent transform before drawing the temp canvas (it already has transforms baked in)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(temp, 0, 0)
}

function renderGroupChildren(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  group: GroupLayer,
  docWidth: number,
  docHeight: number,
  isExport = false,
): void {
  for (const child of group.children) {
    renderLayerToContext(ctx, child, docWidth, docHeight, isExport)
  }
}

function createFillStyle(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  fill: Fill,
  width: number,
  height: number,
): string | CanvasGradient {
  const hw = width / 2
  const hh = height / 2

  switch (fill.type) {
    case 'solid':
      return fill.color
    case 'linear-gradient': {
      const rad = (fill.gradient.angle * Math.PI) / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)
      const grad = ctx.createLinearGradient(-hw * cos, -hh * sin, hw * cos, hh * sin)
      for (const stop of fill.gradient.stops) {
        grad.addColorStop(stop.offset, stop.color)
      }
      return grad
    }
    case 'radial-gradient': {
      const r = Math.max(hw, hh)
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
      for (const stop of fill.gradient.stops) {
        grad.addColorStop(stop.offset, stop.color)
      }
      return grad
    }
    case 'conic-gradient': {
      const startAngle = (fill.gradient.angle * Math.PI) / 180
      const grad = ctx.createConicGradient(startAngle, 0, 0)
      for (const stop of fill.gradient.stops) {
        grad.addColorStop(stop.offset, stop.color)
      }
      return grad
    }
    case 'none':
      return 'transparent'
  }
}

export function rasterizeLayer(layer: Layer, docWidth: number, docHeight: number): ImageData {
  const canvas = new OffscreenCanvas(docWidth, docHeight)
  const ctx = canvas.getContext('2d')!
  ctx.translate(docWidth / 2, docHeight / 2)

  // Render the layer without opacity/blend (raw content with transform)
  const { x, y, scaleX, scaleY, rotation } = layer.transform
  ctx.translate(x, y)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.scale(scaleX, scaleY)

  switch (layer.type) {
    case 'image':
      renderImageLayer(ctx, layer)
      break
    case 'shape':
      renderShapeLayer(ctx, layer)
      break
    case 'text':
      renderTextLayer(ctx, layer)
      break
    case 'group':
      renderGroupChildren(ctx, layer, docWidth, docHeight)
      break
  }

  return ctx.getImageData(0, 0, docWidth, docHeight)
}
