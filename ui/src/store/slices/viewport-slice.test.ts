import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from '../index'

function tickUntilDone() {
  for (let i = 0; i < 100; i++) {
    if (!useEditorStore.getState().tickViewportAnimation()) break
  }
}

describe('viewport-slice', () => {
  beforeEach(() => {
    useEditorStore.setState({
      viewport: { panX: 0, panY: 0, zoom: 1 },
      viewportTarget: null,
    })
  })

  it('pans by the given delta', () => {
    useEditorStore.getState().pan(10, 20)
    const { viewport } = useEditorStore.getState()
    expect(viewport.panX).toBe(10)
    expect(viewport.panY).toBe(20)
  })

  it('accumulates multiple pans', () => {
    useEditorStore.getState().pan(5, 5)
    useEditorStore.getState().pan(-3, 7)
    const { viewport } = useEditorStore.getState()
    expect(viewport.panX).toBe(2)
    expect(viewport.panY).toBe(12)
  })

  it('zooms by a factor (animated)', () => {
    useEditorStore.getState().zoom(2)
    tickUntilDone()
    expect(useEditorStore.getState().viewport.zoom).toBe(2)
  })

  it('clamps zoom to min/max', () => {
    useEditorStore.getState().zoom(0.01) // try to go below min
    tickUntilDone()
    expect(useEditorStore.getState().viewport.zoom).toBeGreaterThanOrEqual(0.1)

    useEditorStore.setState({
      viewport: { panX: 0, panY: 0, zoom: 1 },
      viewportTarget: null,
    })
    useEditorStore.getState().zoom(100) // try to go above max
    tickUntilDone()
    expect(useEditorStore.getState().viewport.zoom).toBeLessThanOrEqual(10)
  })

  it('zooms around a center point', () => {
    useEditorStore.getState().zoom(2, 100, 100)
    tickUntilDone()
    const { viewport } = useEditorStore.getState()
    expect(viewport.zoom).toBe(2)
    // Pan should shift to keep the center point stable
    expect(viewport.panX).not.toBe(0)
    expect(viewport.panY).not.toBe(0)
  })

  it('setZoom sets an absolute zoom level (animated)', () => {
    useEditorStore.getState().setZoom(3)
    tickUntilDone()
    expect(useEditorStore.getState().viewport.zoom).toBe(3)
  })

  it('resetViewport returns to defaults immediately', () => {
    useEditorStore.getState().pan(50, 50)
    useEditorStore.getState().zoom(3)
    tickUntilDone()
    useEditorStore.getState().resetViewport()
    const { viewport, viewportTarget } = useEditorStore.getState()
    expect(viewport).toEqual({ panX: 0, panY: 0, zoom: 1 })
    expect(viewportTarget).toBeNull()
  })

  it('new zoom input retargets during animation', () => {
    useEditorStore.getState().zoom(2)
    // Don't tick to completion — retarget
    useEditorStore.getState().zoom(0.5) // 2 * 0.5 = 1
    tickUntilDone()
    expect(useEditorStore.getState().viewport.zoom).toBeCloseTo(1, 2)
  })
})
