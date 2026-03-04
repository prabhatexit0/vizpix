import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from '../index'

describe('viewport-slice', () => {
  beforeEach(() => {
    useEditorStore.setState({
      viewport: { panX: 0, panY: 0, zoom: 1 },
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

  it('zooms by a factor', () => {
    useEditorStore.getState().zoom(2)
    expect(useEditorStore.getState().viewport.zoom).toBe(2)
  })

  it('clamps zoom to min/max', () => {
    useEditorStore.getState().zoom(0.01) // try to go below min
    expect(useEditorStore.getState().viewport.zoom).toBeGreaterThanOrEqual(0.1)

    useEditorStore.setState({ viewport: { panX: 0, panY: 0, zoom: 1 } })
    useEditorStore.getState().zoom(100) // try to go above max
    expect(useEditorStore.getState().viewport.zoom).toBeLessThanOrEqual(10)
  })

  it('zooms around a center point', () => {
    useEditorStore.getState().zoom(2, 100, 100)
    const { viewport } = useEditorStore.getState()
    expect(viewport.zoom).toBe(2)
    // Pan should shift to keep the center point stable
    expect(viewport.panX).not.toBe(0)
    expect(viewport.panY).not.toBe(0)
  })

  it('setZoom sets an absolute zoom level', () => {
    useEditorStore.getState().setZoom(3)
    expect(useEditorStore.getState().viewport.zoom).toBe(3)
  })

  it('resetViewport returns to defaults', () => {
    useEditorStore.getState().pan(50, 50)
    useEditorStore.getState().zoom(3)
    useEditorStore.getState().resetViewport()
    const { viewport } = useEditorStore.getState()
    expect(viewport).toEqual({ panX: 0, panY: 0, zoom: 1 })
  })
})
