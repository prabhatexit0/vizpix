import type { Layer } from '@/store/types'
import { getLayerDimensions, findLayerById } from './layer-utils'

export interface SnapGuide {
  axis: 'x' | 'y'
  position: number // world coordinate of the guide line
}

export interface SnapResult {
  x: number
  y: number
  guides: SnapGuide[]
}

interface Rect {
  cx: number
  cy: number
  left: number
  right: number
  top: number
  bottom: number
}

function getLayerRect(layer: Layer): Rect {
  const dims = getLayerDimensions(layer)
  const { x, y, scaleX, scaleY } = layer.transform
  const hw = (dims.width * Math.abs(scaleX)) / 2
  const hh = (dims.height * Math.abs(scaleY)) / 2
  return {
    cx: x,
    cy: y,
    left: x - hw,
    right: x + hw,
    top: y - hh,
    bottom: y + hh,
  }
}

/**
 * Snap a layer position to nearby guides.
 * Returns adjusted x/y and active guide lines.
 */
export function snapLayer(
  movingLayerId: string,
  proposedX: number,
  proposedY: number,
  layers: Layer[],
  documentWidth: number,
  documentHeight: number,
  threshold: number,
): SnapResult {
  const movingLayer = findLayerById(layers, movingLayerId)
  if (!movingLayer) return { x: proposedX, y: proposedY, guides: [] }

  const dims = getLayerDimensions(movingLayer)
  const { scaleX, scaleY } = movingLayer.transform
  const hw = (dims.width * Math.abs(scaleX)) / 2
  const hh = (dims.height * Math.abs(scaleY)) / 2

  // Moving layer edges at proposed position
  const moving = {
    cx: proposedX,
    cy: proposedY,
    left: proposedX - hw,
    right: proposedX + hw,
    top: proposedY - hh,
    bottom: proposedY + hh,
  }

  // Collect snap targets
  const xTargets: number[] = []
  const yTargets: number[] = []

  // Document edges and center
  const docHW = documentWidth / 2
  const docHH = documentHeight / 2
  xTargets.push(-docHW, 0, docHW)
  yTargets.push(-docHH, 0, docHH)

  // Other layer edges and centers
  for (const layer of layers) {
    if (layer.id === movingLayerId || !layer.visible) continue
    const r = getLayerRect(layer)
    xTargets.push(r.left, r.cx, r.right)
    yTargets.push(r.top, r.cy, r.bottom)
  }

  // Moving layer snap points (edges + center)
  const movingXPoints = [
    { value: moving.left, offset: moving.left - proposedX },
    { value: moving.cx, offset: 0 },
    { value: moving.right, offset: moving.right - proposedX },
  ]
  const movingYPoints = [
    { value: moving.top, offset: moving.top - proposedY },
    { value: moving.cy, offset: 0 },
    { value: moving.bottom, offset: moving.bottom - proposedY },
  ]

  let snappedX = proposedX
  let snappedY = proposedY
  const guides: SnapGuide[] = []

  // Find best X snap
  let bestXDist = threshold
  for (const target of xTargets) {
    for (const pt of movingXPoints) {
      const dist = Math.abs(pt.value - target)
      if (dist < bestXDist) {
        bestXDist = dist
        snappedX = target - pt.offset
      }
    }
  }
  if (snappedX !== proposedX) {
    // Collect all X guides that match at snapped position
    const snappedLeft = snappedX - hw
    const snappedRight = snappedX + hw
    const snappedPoints = [snappedLeft, snappedX, snappedRight]
    for (const target of xTargets) {
      for (const sp of snappedPoints) {
        if (Math.abs(sp - target) < 0.5) {
          guides.push({ axis: 'x', position: target })
        }
      }
    }
  }

  // Find best Y snap
  let bestYDist = threshold
  for (const target of yTargets) {
    for (const pt of movingYPoints) {
      const dist = Math.abs(pt.value - target)
      if (dist < bestYDist) {
        bestYDist = dist
        snappedY = target - pt.offset
      }
    }
  }
  if (snappedY !== proposedY) {
    const snappedTop = snappedY - hh
    const snappedBottom = snappedY + hh
    const snappedPoints = [snappedTop, snappedY, snappedBottom]
    for (const target of yTargets) {
      for (const sp of snappedPoints) {
        if (Math.abs(sp - target) < 0.5) {
          guides.push({ axis: 'y', position: target })
        }
      }
    }
  }

  // Deduplicate guides
  const seen = new Set<string>()
  const unique = guides.filter((g) => {
    const key = `${g.axis}:${g.position}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return { x: snappedX, y: snappedY, guides: unique }
}
