import type { Layer, ImageLayer, ShapeLayer, TextLayer, GroupLayer, Fill } from '@/store/types'
import { blendModeMap } from './blend-modes'
import { wrapText } from './layer-utils'

export function renderLayerToContext(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layer: Layer,
  docWidth: number,
  docHeight: number,
): void {
  if (!layer.visible) return

  // If layer has a mask, render via temp canvas
  if (layer.mask?.imageBitmap) {
    renderWithMask(ctx, layer, docWidth, docHeight)
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
      renderTextLayer(ctx, layer)
      break
    case 'group':
      renderGroupLayer(ctx, layer, docWidth, docHeight)
      break
  }

  ctx.restore()
}

function renderWithMask(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layer: Layer,
  docWidth: number,
  docHeight: number,
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
      renderTextLayer(tctx, layer)
      break
    case 'group':
      // Reset transform for group children since they manage their own
      tctx.setTransform(1, 0, 0, 1, docWidth / 2, docHeight / 2)
      tctx.translate(x, y)
      tctx.rotate((rotation * Math.PI) / 180)
      tctx.scale(scaleX, scaleY)
      renderGroupChildren(tctx, layer, docWidth, docHeight)
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

function renderTextLayer(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layer: TextLayer,
): void {
  const {
    content,
    fontFamily,
    fontSize,
    fontWeight,
    fontStyle,
    fill,
    textAlign,
    lineHeight,
    letterSpacing,
    maxWidth,
  } = layer
  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`
  ctx.textAlign = textAlign
  ctx.textBaseline = 'top'

  if ('letterSpacing' in ctx) {
    ;(ctx as CanvasRenderingContext2D).letterSpacing = `${letterSpacing}px`
  }

  // Determine lines
  let lines: string[]
  if (maxWidth !== null) {
    lines = wrapText(ctx as CanvasRenderingContext2D, content, maxWidth)
  } else {
    lines = content.split('\n')
  }

  const lineH = fontSize * lineHeight
  const totalHeight = lines.length * lineH

  // Calculate text block width for alignment offset
  let textBlockWidth: number
  if (maxWidth !== null) {
    textBlockWidth = maxWidth
  } else {
    textBlockWidth = Math.max(...lines.map((l) => ctx.measureText(l).width))
  }

  // X offset based on alignment
  let xOffset: number
  if (textAlign === 'left') xOffset = -textBlockWidth / 2
  else if (textAlign === 'right') xOffset = textBlockWidth / 2
  else xOffset = 0

  const yStart = -totalHeight / 2

  // If fill is a gradient, use compositing approach
  if (fill.type !== 'none' && fill.type !== 'solid') {
    const tw = Math.ceil(textBlockWidth) + 4
    const th = Math.ceil(totalHeight) + 4
    const temp = new OffscreenCanvas(tw, th)
    const tctx = temp.getContext('2d')!
    tctx.font = ctx.font
    tctx.textAlign = textAlign
    tctx.textBaseline = 'top'
    if ('letterSpacing' in tctx) {
      ;(tctx as unknown as CanvasRenderingContext2D).letterSpacing = `${letterSpacing}px`
    }
    tctx.fillStyle = 'white'
    let txOff: number
    if (textAlign === 'left') txOff = 2
    else if (textAlign === 'right') txOff = tw - 2
    else txOff = tw / 2
    for (let i = 0; i < lines.length; i++) {
      tctx.fillText(lines[i], txOff, 2 + i * lineH)
    }
    tctx.globalCompositeOperation = 'source-in'
    tctx.fillStyle = createFillStyle(tctx, fill, tw, th)
    tctx.fillRect(0, 0, tw, th)

    ctx.drawImage(temp, -tw / 2, yStart - 2)
  } else {
    if (fill.type === 'solid') {
      ctx.fillStyle = fill.color
    } else {
      ctx.fillStyle = '#ffffff'
    }
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], xOffset, yStart + i * lineH)
    }
  }
}

function renderGroupLayer(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  group: GroupLayer,
  docWidth: number,
  docHeight: number,
): void {
  // Passthrough optimization: if opacity 1, normal blend, no mask, render children directly
  if (group.opacity === 1 && group.blendMode === 'normal' && !group.mask) {
    renderGroupChildren(ctx, group, docWidth, docHeight)
    return
  }

  // Otherwise composite to temp canvas
  const temp = new OffscreenCanvas(docWidth, docHeight)
  const tctx = temp.getContext('2d')!
  tctx.translate(docWidth / 2, docHeight / 2)

  for (const child of group.children) {
    renderLayerToContext(tctx, child, docWidth, docHeight)
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
): void {
  for (const child of group.children) {
    renderLayerToContext(ctx, child, docWidth, docHeight)
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
