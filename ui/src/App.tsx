import { useEffect, useState, useCallback } from 'react'
import { useEditorStore } from '@/store'
import { EditorLayout } from '@/components/layout/editor-layout'
import { CanvasSizePage } from '@/components/dialogs/canvas-size-dialog'
import { loadVpd } from '@/lib/vpd'

function App() {
  const initWasm = useEditorStore((s) => s.initWasm)
  const setDocumentSize = useEditorStore((s) => s.setDocumentSize)
  const setDocumentBackground = useEditorStore((s) => s.setDocumentBackground)
  const fitToDocument = useEditorStore((s) => s.fitToDocument)
  const loadDocument = useEditorStore((s) => s.loadDocument)
  const [showEditor, setShowEditor] = useState(false)

  useEffect(() => {
    initWasm()
  }, [initWasm])

  const handleCanvasApply = useCallback(
    (w: number, h: number, bg: string) => {
      setDocumentSize(w, h)
      setDocumentBackground(bg)
      setShowEditor(true)
      // Fit document to viewport after editor mounts — double rAF ensures layout is settled
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const container = document.querySelector("[data-slot='editor-canvas']")
          if (container) {
            const rect = container.getBoundingClientRect()
            fitToDocument(rect.width, rect.height)
          }
        })
      })
    },
    [setDocumentSize, setDocumentBackground, fitToDocument],
  )

  const handleOpenProject = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.vpd'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const result = await loadVpd(file)
      loadDocument({
        layers: result.layers,
        activeLayerId: result.layers[result.layers.length - 1]?.id ?? null,
        documentWidth: result.manifest.document.width,
        documentHeight: result.manifest.document.height,
        documentBackground: result.manifest.document.background,
      })
      setShowEditor(true)
      requestAnimationFrame(() => {
        const container = document.querySelector("[data-slot='editor-canvas']")
        if (container) {
          const rect = container.getBoundingClientRect()
          fitToDocument(rect.width, rect.height)
        }
      })
    }
    input.click()
  }, [loadDocument, fitToDocument])

  if (!showEditor) {
    return <CanvasSizePage onApply={handleCanvasApply} onOpenProject={handleOpenProject} />
  }

  return <EditorLayout />
}

export default App
