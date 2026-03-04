import { useCallback, useRef, useState } from 'react'
import {
  MousePointer2,
  Hand,
  ZoomIn,
  Crop,
  ImagePlus,
  Undo2,
  Redo2,
  Frame,
  Download,
  Save,
  FolderOpen,
} from 'lucide-react'
import { useEditorStore } from '@/store'
import { useResponsive } from '@/hooks/use-responsive'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { ToolMode } from '@/store/types'
import { CanvasSizeDialog } from '@/components/dialogs/canvas-size-dialog'
import { ExportDialog } from '@/components/dialogs/export-dialog'
import { ConfirmDialog } from '@/components/dialogs/confirm-dialog'
import { saveVpd, loadVpd } from '@/lib/vpd'

const TOOLS: { mode: ToolMode; icon: typeof MousePointer2; label: string; shortcut: string }[] = [
  { mode: 'pointer', icon: MousePointer2, label: 'Pointer', shortcut: 'V' },
  { mode: 'hand', icon: Hand, label: 'Hand', shortcut: 'H' },
  { mode: 'zoom', icon: ZoomIn, label: 'Zoom', shortcut: 'Z' },
  { mode: 'crop', icon: Crop, label: 'Crop', shortcut: 'C' },
]

export function Toolbar() {
  const activeTool = useEditorStore((s) => s.activeTool)
  const setActiveTool = useEditorStore((s) => s.setActiveTool)
  const addLayer = useEditorStore((s) => s.addLayer)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)
  const undoStack = useEditorStore((s) => s.undoStack)
  const redoStack = useEditorStore((s) => s.redoStack)
  const layers = useEditorStore((s) => s.layers)
  const activeLayerId = useEditorStore((s) => s.activeLayerId)
  const documentWidth = useEditorStore((s) => s.documentWidth)
  const documentHeight = useEditorStore((s) => s.documentHeight)
  const documentBackground = useEditorStore((s) => s.documentBackground)
  const loadDocument = useEditorStore((s) => s.loadDocument)
  const fitToDocument = useEditorStore((s) => s.fitToDocument)
  const { isMobile } = useResponsive()
  const [canvasSizeOpen, setCanvasSizeOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const pendingFileRef = useRef<File | null>(null)

  const handleAddImage = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp,image/gif'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const bytes = new Uint8Array(await file.arrayBuffer())
      addLayer(bytes, file.name.replace(/\.[^.]+$/, ''))
    }
    input.click()
  }, [addLayer])

  const handleSave = useCallback(() => {
    saveVpd(layers, documentWidth, documentHeight, documentBackground, activeLayerId)
  }, [layers, documentWidth, documentHeight, documentBackground, activeLayerId])

  const performLoad = useCallback(
    async (file: File) => {
      const result = await loadVpd(file)
      loadDocument({
        layers: result.layers,
        activeLayerId: result.layers[result.layers.length - 1]?.id ?? null,
        documentWidth: result.manifest.document.width,
        documentHeight: result.manifest.document.height,
        documentBackground: result.manifest.document.background,
      })
      requestAnimationFrame(() => {
        const container = document.querySelector("[data-slot='editor-canvas']")
        if (container) {
          const rect = container.getBoundingClientRect()
          fitToDocument(rect.width, rect.height)
        }
      })
    },
    [loadDocument, fitToDocument],
  )

  const handleOpen = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.vpd'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      if (layers.length > 0) {
        pendingFileRef.current = file
        setConfirmOpen(true)
      } else {
        performLoad(file)
      }
    }
    input.click()
  }, [layers.length, performLoad])

  const handleConfirmOpen = useCallback(() => {
    const file = pendingFileRef.current
    pendingFileRef.current = null
    if (file) performLoad(file)
  }, [performLoad])

  const buttons = (
    <>
      {TOOLS.map(({ mode, icon: Icon, label, shortcut }) => (
        <Tooltip key={mode}>
          <TooltipTrigger asChild>
            <button
              onClick={() => setActiveTool(mode)}
              className={cn(
                'flex items-center justify-center rounded-md p-2 transition-colors',
                activeTool === mode
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-neutral-400 hover:bg-white/10 hover:text-white',
              )}
            >
              <Icon size={18} />
            </button>
          </TooltipTrigger>
          <TooltipContent side={isMobile ? 'top' : 'right'}>
            {label} ({shortcut})
          </TooltipContent>
        </Tooltip>
      ))}

      <div className={cn(isMobile ? 'h-5 w-px bg-white/15' : 'mx-1 h-px w-full bg-white/15')} />

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleAddImage}
            className="flex items-center justify-center rounded-md p-2 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ImagePlus size={18} />
          </button>
        </TooltipTrigger>
        <TooltipContent side={isMobile ? 'top' : 'right'}>Add Image</TooltipContent>
      </Tooltip>

      <div className={cn(isMobile ? 'h-5 w-px bg-white/15' : 'mx-1 h-px w-full bg-white/15')} />

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleSave}
            className="flex items-center justify-center rounded-md p-2 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Save size={18} />
          </button>
        </TooltipTrigger>
        <TooltipContent side={isMobile ? 'top' : 'right'}>Save Project</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleOpen}
            className="flex items-center justify-center rounded-md p-2 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <FolderOpen size={18} />
          </button>
        </TooltipTrigger>
        <TooltipContent side={isMobile ? 'top' : 'right'}>Open Project</TooltipContent>
      </Tooltip>

      <div className={cn(isMobile ? 'h-5 w-px bg-white/15' : 'mx-1 h-px w-full bg-white/15')} />

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => undo()}
            disabled={undoStack.length === 0}
            className="flex items-center justify-center rounded-md p-2 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-25"
          >
            <Undo2 size={18} />
          </button>
        </TooltipTrigger>
        <TooltipContent side={isMobile ? 'top' : 'right'}>Undo (Ctrl+Z)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => redo()}
            disabled={redoStack.length === 0}
            className="flex items-center justify-center rounded-md p-2 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-25"
          >
            <Redo2 size={18} />
          </button>
        </TooltipTrigger>
        <TooltipContent side={isMobile ? 'top' : 'right'}>Redo (Ctrl+Shift+Z)</TooltipContent>
      </Tooltip>

      <div className={cn(isMobile ? 'h-5 w-px bg-white/15' : 'mx-1 h-px w-full bg-white/15')} />

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setCanvasSizeOpen(true)}
            className="flex items-center justify-center rounded-md p-2 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Frame size={18} />
          </button>
        </TooltipTrigger>
        <TooltipContent side={isMobile ? 'top' : 'right'}>Canvas Size</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setExportOpen(true)}
            className="flex items-center justify-center rounded-md p-2 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Download size={18} />
          </button>
        </TooltipTrigger>
        <TooltipContent side={isMobile ? 'top' : 'right'}>Export</TooltipContent>
      </Tooltip>
    </>
  )

  const dialogs = (
    <>
      <CanvasSizeDialog open={canvasSizeOpen} onOpenChange={setCanvasSizeOpen} />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={handleConfirmOpen}
        title="Open Project"
        description="Opening a project will replace your current work. Any unsaved changes will be lost."
        confirmLabel="Open"
      />
    </>
  )

  if (isMobile) {
    return (
      <>
        <div className="absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-neutral-900/90 px-2 py-1.5 backdrop-blur-md">
          {buttons}
        </div>
        {dialogs}
      </>
    )
  }

  return (
    <>
      <div className="flex w-12 flex-col items-center gap-1 border-r border-white/15 bg-neutral-900 py-2">
        {buttons}
      </div>
      {dialogs}
    </>
  )
}
