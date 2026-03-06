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
  Square,
  Circle,
  Type,
  MoreHorizontal,
} from 'lucide-react'
import { Popover as PopoverPrimitive } from 'radix-ui'
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
  const documentWidth = useEditorStore((s) => s.documentWidth)
  const documentHeight = useEditorStore((s) => s.documentHeight)
  const documentBackground = useEditorStore((s) => s.documentBackground)
  const loadDocument = useEditorStore((s) => s.loadDocument)
  const fitToDocument = useEditorStore((s) => s.fitToDocument)
  const { isDesktop } = useResponsive()
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
    saveVpd(layers, documentWidth, documentHeight, documentBackground)
  }, [layers, documentWidth, documentHeight, documentBackground])

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

  const iconSize = 20
  const [overflowOpen, setOverflowOpen] = useState(false)

  const toolBtnClass = (active: boolean, mobile = false) =>
    cn(
      'flex items-center justify-center rounded-md transition-colors',
      mobile ? 'min-h-[44px] min-w-[44px] p-2.5' : 'p-2',
      active ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:bg-white/10 hover:text-white',
    )

  const actionBtnClass = (mobile = false) =>
    cn(
      'flex items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/10 hover:text-white',
      mobile ? 'min-h-[44px] min-w-[44px] p-2.5' : 'p-2',
    )

  const desktopButtons = (
    <>
      {TOOLS.map(({ mode, icon: Icon, label, shortcut }) => (
        <Tooltip key={mode}>
          <TooltipTrigger asChild>
            <button
              onClick={() => setActiveTool(mode)}
              className={toolBtnClass(activeTool === mode)}
            >
              <Icon size={iconSize} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {label} ({shortcut})
          </TooltipContent>
        </Tooltip>
      ))}

      <div className="mx-1 h-px w-full bg-white/15" />

      <span className="mt-1 text-[10px] font-semibold tracking-wider text-neutral-400">DRAW</span>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setActiveTool('draw-rectangle')}
            className={toolBtnClass(activeTool === 'draw-rectangle')}
          >
            <Square size={iconSize} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Rectangle (R)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setActiveTool('draw-ellipse')}
            className={toolBtnClass(activeTool === 'draw-ellipse')}
          >
            <Circle size={iconSize} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Ellipse (E)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setActiveTool('draw-text')}
            className={toolBtnClass(activeTool === 'draw-text')}
          >
            <Type size={iconSize} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Text (T)</TooltipContent>
      </Tooltip>

      <div className="mx-1 h-px w-full bg-white/15" />

      <Tooltip>
        <TooltipTrigger asChild>
          <button onClick={handleAddImage} className={actionBtnClass()}>
            <ImagePlus size={iconSize} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Add Image</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button onClick={handleSave} className={actionBtnClass()}>
            <Save size={iconSize} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Save Project</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button onClick={handleOpen} className={actionBtnClass()}>
            <FolderOpen size={iconSize} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Open Project</TooltipContent>
      </Tooltip>

      <div className="mx-1 h-px w-full bg-white/15" />

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => undo()}
            disabled={undoStack.length === 0}
            className={cn(actionBtnClass(), 'disabled:pointer-events-none disabled:opacity-25')}
          >
            <Undo2 size={iconSize} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Undo (Ctrl+Z)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => redo()}
            disabled={redoStack.length === 0}
            className={cn(actionBtnClass(), 'disabled:pointer-events-none disabled:opacity-25')}
          >
            <Redo2 size={iconSize} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Redo (Ctrl+Shift+Z)</TooltipContent>
      </Tooltip>

      <div className="mx-1 h-px w-full bg-white/15" />

      <Tooltip>
        <TooltipTrigger asChild>
          <button onClick={() => setCanvasSizeOpen(true)} className={actionBtnClass()}>
            <Frame size={iconSize} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Canvas Size</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button onClick={() => setExportOpen(true)} className={actionBtnClass()}>
            <Download size={iconSize} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Export</TooltipContent>
      </Tooltip>
    </>
  )

  const OVERFLOW_TOOLS: { mode: ToolMode; icon: typeof MousePointer2; label: string }[] = [
    { mode: 'hand', icon: Hand, label: 'Hand' },
    { mode: 'zoom', icon: ZoomIn, label: 'Zoom' },
    { mode: 'crop', icon: Crop, label: 'Crop' },
  ]

  const OVERFLOW_ACTIONS: { icon: typeof MousePointer2; label: string; action: () => void }[] = [
    { icon: ImagePlus, label: 'Add Image', action: handleAddImage },
    { icon: Save, label: 'Save', action: handleSave },
    { icon: FolderOpen, label: 'Open', action: handleOpen },
    { icon: Frame, label: 'Canvas Size', action: () => setCanvasSizeOpen(true) },
    { icon: Download, label: 'Export', action: () => setExportOpen(true) },
  ]

  const hasOverflowToolActive = OVERFLOW_TOOLS.some((t) => t.mode === activeTool)

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

  if (!isDesktop) {
    return (
      <>
        <div className="absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-neutral-900/90 px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] backdrop-blur-md">
          <button
            onClick={() => setActiveTool('pointer')}
            className={toolBtnClass(activeTool === 'pointer', true)}
          >
            <MousePointer2 size={iconSize} />
          </button>
          <button
            onClick={() => setActiveTool('draw-rectangle')}
            className={toolBtnClass(activeTool === 'draw-rectangle', true)}
          >
            <Square size={iconSize} />
          </button>
          <button
            onClick={() => setActiveTool('draw-ellipse')}
            className={toolBtnClass(activeTool === 'draw-ellipse', true)}
          >
            <Circle size={iconSize} />
          </button>
          <button
            onClick={() => setActiveTool('draw-text')}
            className={toolBtnClass(activeTool === 'draw-text', true)}
          >
            <Type size={iconSize} />
          </button>

          <div className="h-5 w-px bg-white/15" />

          <button
            onClick={() => undo()}
            disabled={undoStack.length === 0}
            className={cn(actionBtnClass(true), 'disabled:pointer-events-none disabled:opacity-25')}
          >
            <Undo2 size={iconSize} />
          </button>
          <button
            onClick={() => redo()}
            disabled={redoStack.length === 0}
            className={cn(actionBtnClass(true), 'disabled:pointer-events-none disabled:opacity-25')}
          >
            <Redo2 size={iconSize} />
          </button>

          <div className="h-5 w-px bg-white/15" />

          <PopoverPrimitive.Root open={overflowOpen} onOpenChange={setOverflowOpen}>
            <PopoverPrimitive.Trigger asChild>
              <button
                className={cn(
                  'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md p-2.5 transition-colors',
                  hasOverflowToolActive || overflowOpen
                    ? 'bg-blue-600 text-white'
                    : 'text-neutral-400 hover:bg-white/10 hover:text-white',
                )}
              >
                <MoreHorizontal size={iconSize} />
              </button>
            </PopoverPrimitive.Trigger>
            <PopoverPrimitive.Portal>
              <PopoverPrimitive.Content
                side="top"
                sideOffset={12}
                className="z-50 rounded-xl border border-white/15 bg-neutral-900/95 p-3 shadow-xl backdrop-blur-md"
              >
                <div className="grid grid-cols-4 gap-1">
                  {OVERFLOW_TOOLS.map(({ mode, icon: Icon, label }) => (
                    <button
                      key={mode}
                      onClick={() => {
                        setActiveTool(mode)
                        setOverflowOpen(false)
                      }}
                      className={cn(
                        'flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 rounded-lg p-2 transition-colors',
                        activeTool === mode
                          ? 'bg-blue-600 text-white'
                          : 'text-neutral-400 hover:bg-white/10 hover:text-white',
                      )}
                    >
                      <Icon size={20} />
                      <span className="text-[10px]">{label}</span>
                    </button>
                  ))}
                  {OVERFLOW_ACTIONS.map(({ icon: Icon, label, action }) => (
                    <button
                      key={label}
                      onClick={() => {
                        action()
                        setOverflowOpen(false)
                      }}
                      className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 rounded-lg p-2 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <Icon size={20} />
                      <span className="text-[10px]">{label}</span>
                    </button>
                  ))}
                </div>
                <PopoverPrimitive.Arrow className="fill-neutral-900/95" />
              </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
          </PopoverPrimitive.Root>
        </div>
        {dialogs}
      </>
    )
  }

  return (
    <>
      <div className="flex w-12 flex-col items-center gap-1 border-r border-white/15 bg-neutral-900 py-2">
        {desktopButtons}
      </div>
      {dialogs}
    </>
  )
}
