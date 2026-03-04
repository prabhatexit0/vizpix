import { useState, useMemo } from 'react'
import { ArrowRightLeft } from 'lucide-react'
import { useResponsive } from '@/hooks/use-responsive'
import { useEditorStore } from '@/store'
import { CANVAS_SIZE_PRESETS, MIN_CANVAS_SIZE, MAX_CANVAS_SIZE } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer'
import { cn } from '@/lib/utils'

interface CanvasSizeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface CanvasSizePageProps {
  onApply: (w: number, h: number, bg: string) => void
  onOpenProject?: () => void
}

const CATEGORIES = ['Social Media', 'Standard', 'Square'] as const

function clampSize(v: number) {
  return Math.max(MIN_CANVAS_SIZE, Math.min(MAX_CANVAS_SIZE, Math.round(v)))
}

function CanvasSizeForm({
  onApply,
  onCancel,
}: {
  onApply: (w: number, h: number, bg: string) => void
  onCancel?: () => void
}) {
  const docWidth = useEditorStore((s) => s.documentWidth)
  const docHeight = useEditorStore((s) => s.documentHeight)
  const docBg = useEditorStore((s) => s.documentBackground)

  const [width, setWidth] = useState(docWidth)
  const [height, setHeight] = useState(docHeight)
  const [background, setBackground] = useState(docBg)

  const aspectRatio = width / height
  const previewW = aspectRatio >= 1 ? 120 : Math.round(120 * aspectRatio)
  const previewH = aspectRatio >= 1 ? Math.round(120 / aspectRatio) : 120

  const grouped = useMemo(() => {
    const map = new Map<string, typeof CANVAS_SIZE_PRESETS>()
    for (const cat of CATEGORIES) {
      map.set(
        cat,
        CANVAS_SIZE_PRESETS.filter((p) => p.category === cat),
      )
    }
    return map
  }, [])

  return (
    <div className="flex flex-col gap-4">
      {/* Presets */}
      <div className="scrollbar-none max-h-52 space-y-3 overflow-y-auto pr-1">
        {CATEGORIES.map((cat) => (
          <div key={cat}>
            <p className="mb-1.5 text-xs font-medium tracking-wider text-neutral-400 uppercase">
              {cat}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {grouped.get(cat)!.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => {
                    setWidth(preset.width)
                    setHeight(preset.height)
                  }}
                  className={cn(
                    'rounded-md border border-white/8 px-2.5 py-1.5 text-left text-xs transition-colors hover:border-blue-500/50 hover:bg-blue-500/10',
                    width === preset.width &&
                      height === preset.height &&
                      'border-blue-500/60 bg-blue-500/15 text-blue-400',
                  )}
                >
                  <span className="font-medium">{preset.label}</span>
                  <span className="ml-1 text-neutral-500">
                    {preset.width}&times;{preset.height}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Custom size */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-neutral-400">Width</label>
          <Input
            type="number"
            min={MIN_CANVAS_SIZE}
            max={MAX_CANVAS_SIZE}
            value={width}
            onChange={(e) => setWidth(clampSize(Number(e.target.value) || 1))}
          />
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="mb-0.5"
          onClick={() => {
            setWidth(height)
            setHeight(width)
          }}
        >
          <ArrowRightLeft size={16} />
        </Button>

        <div className="flex-1">
          <label className="mb-1 block text-xs text-neutral-400">Height</label>
          <Input
            type="number"
            min={MIN_CANVAS_SIZE}
            max={MAX_CANVAS_SIZE}
            value={height}
            onChange={(e) => setHeight(clampSize(Number(e.target.value) || 1))}
          />
        </div>
      </div>

      {/* Background color */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-neutral-400">Background</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            className="h-8 w-8 cursor-pointer rounded border border-white/8 bg-transparent"
          />
          <Input
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            className="w-24 font-mono text-xs"
          />
        </div>
      </div>

      {/* Preview */}
      <div className="flex items-center justify-center">
        <div
          className="border border-white/15"
          style={{
            width: previewW,
            height: previewH,
            backgroundColor: background,
          }}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button onClick={() => onApply(width, height, background)}>
          {onCancel ? 'Apply' : 'Create Canvas'}
        </Button>
      </div>
    </div>
  )
}

/** Full-page canvas size picker shown on app launch */
export function CanvasSizePage({ onApply, onOpenProject }: CanvasSizePageProps) {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-neutral-950 text-white">
      <div className="w-full max-w-md px-6">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold">New Canvas</h1>
          <p className="mt-1 text-sm text-neutral-400">Choose a size to get started</p>
        </div>
        <CanvasSizeForm onApply={onApply} />
        {onOpenProject && (
          <div className="mt-4 text-center">
            <button
              onClick={onOpenProject}
              className="text-sm text-neutral-400 underline underline-offset-2 transition-colors hover:text-white"
            >
              Open existing project
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** Dialog/Drawer for changing canvas size from the toolbar */
export function CanvasSizeDialog({ open, onOpenChange }: CanvasSizeDialogProps) {
  const setDocumentSize = useEditorStore((s) => s.setDocumentSize)
  const setDocumentBackground = useEditorStore((s) => s.setDocumentBackground)
  const fitToDocument = useEditorStore((s) => s.fitToDocument)
  const { isMobile } = useResponsive()

  const handleApply = (w: number, h: number, bg: string) => {
    setDocumentSize(w, h)
    setDocumentBackground(bg)
    // Use requestAnimationFrame to read the canvas container size after the store update
    requestAnimationFrame(() => {
      const container = document.querySelector("[data-slot='editor-canvas']")
      if (container) {
        const rect = container.getBoundingClientRect()
        fitToDocument(rect.width, rect.height)
      }
    })
    onOpenChange(false)
  }

  const handleCancel = () => onOpenChange(false)

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Canvas Size</DrawerTitle>
            <DrawerDescription>Choose your canvas dimensions</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4">
            <CanvasSizeForm onApply={handleApply} onCancel={handleCancel} />
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Canvas Size</DialogTitle>
          <DialogDescription>Choose your canvas dimensions</DialogDescription>
        </DialogHeader>
        <CanvasSizeForm onApply={handleApply} onCancel={handleCancel} />
      </DialogContent>
    </Dialog>
  )
}
