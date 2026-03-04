import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from '../index'

describe('tools-slice', () => {
  beforeEach(() => {
    useEditorStore.setState({
      activeTool: 'pointer',
      activePanel: 'layers',
    })
  })

  it('defaults to pointer tool', () => {
    expect(useEditorStore.getState().activeTool).toBe('pointer')
  })

  it('setActiveTool changes the active tool', () => {
    useEditorStore.getState().setActiveTool('hand')
    expect(useEditorStore.getState().activeTool).toBe('hand')
  })

  it('setActiveTool can cycle through all tools', () => {
    const tools = ['pointer', 'hand', 'zoom', 'crop'] as const
    for (const tool of tools) {
      useEditorStore.getState().setActiveTool(tool)
      expect(useEditorStore.getState().activeTool).toBe(tool)
    }
  })

  it('defaults to layers panel', () => {
    expect(useEditorStore.getState().activePanel).toBe('layers')
  })

  it('setActivePanel changes the active panel', () => {
    useEditorStore.getState().setActivePanel('properties')
    expect(useEditorStore.getState().activePanel).toBe('properties')
  })
})
