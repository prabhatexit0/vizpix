import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from '../index'

describe('document-slice', () => {
  beforeEach(() => {
    useEditorStore.setState({
      documentWidth: 1920,
      documentHeight: 1080,
      documentBackground: '#ffffff',
    })
  })

  it('has correct default dimensions', () => {
    const { documentWidth, documentHeight } = useEditorStore.getState()
    expect(documentWidth).toBe(1920)
    expect(documentHeight).toBe(1080)
  })

  it('setDocumentSize updates dimensions', () => {
    useEditorStore.getState().setDocumentSize(800, 600)
    const { documentWidth, documentHeight } = useEditorStore.getState()
    expect(documentWidth).toBe(800)
    expect(documentHeight).toBe(600)
  })

  it('setDocumentBackground updates background color', () => {
    useEditorStore.getState().setDocumentBackground('#000000')
    expect(useEditorStore.getState().documentBackground).toBe('#000000')
  })

  it('swapDocumentDimensions swaps width and height', () => {
    useEditorStore.getState().setDocumentSize(1920, 1080)
    useEditorStore.getState().swapDocumentDimensions()
    const { documentWidth, documentHeight } = useEditorStore.getState()
    expect(documentWidth).toBe(1080)
    expect(documentHeight).toBe(1920)
  })

  it('double swap returns to original', () => {
    useEditorStore.getState().setDocumentSize(800, 600)
    useEditorStore.getState().swapDocumentDimensions()
    useEditorStore.getState().swapDocumentDimensions()
    const { documentWidth, documentHeight } = useEditorStore.getState()
    expect(documentWidth).toBe(800)
    expect(documentHeight).toBe(600)
  })
})
