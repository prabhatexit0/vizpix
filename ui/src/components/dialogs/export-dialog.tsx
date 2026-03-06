import { useState, useEffect, useRef } from 'react'
import { useResponsive } from '@/hooks/use-responsive'
import { useEditorStore } from '@/store'
import { exportCanvas, type ExportFormat } from '@/lib/export-utils'
import { renderLayerToContext } from '@/lib/layer-render'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
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

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const PREVIEW_MAX = 300

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function ExportForm({ onClose }: { onClose: () => void }) {
  const layers = useEditorStore((s) => s.layers)
  const documentWidth = useEditorStore((s) => s.documentWidth)
  const documentHeight = useEditorStore((s) => s.documentHeight)
  const documentBackground = useEditorStore((s) => s.documentBackground)

  const [format, setFormat] = useState<ExportFormat>('png')
  const [quality, setQuality] = useState(90)
  const [filename, setFilename] = useState('vizpix-export')
  const [exporting, setExporting] = useState(false)
  const [fallbackWarning, setFallbackWarning] = useState(false)

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [estimatedSize, setEstimatedSize] = useState<number | null>(null)
  const prevUrlRef = useRef<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      const scale = Math.min(PREVIEW_MAX / documentWidth, PREVIEW_MAX / documentHeight, 1)
      const w = Math.round(documentWidth * scale)
      const h = Math.round(documentHeight * scale)

      const canvas = new OffscreenCanvas(w, h)
      const ctx = canvas.getContext('2d')!

      ctx.fillStyle = documentBackground
      ctx.fillRect(0, 0, w, h)
      ctx.translate(w / 2, h / 2)
      ctx.scale(scale, scale)

      for (const layer of layers) {
        renderLayerToContext(ctx, layer, documentWidth, documentHeight, true)
      }

      const mimeType = format === 'png' ? 'image/png' : 'image/jpeg'
      const blobOptions: { type: string; quality?: number } = { type: mimeType }
      if (format === 'jpeg') blobOptions.quality = quality / 100

      canvas
        .convertToBlob(blobOptions)
        .then((blob) => {
          if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current)
          const url = URL.createObjectURL(blob)
          prevUrlRef.current = url
          setPreviewUrl(url)
          setEstimatedSize(blob.size)
        })
        .catch(() => {
          setPreviewUrl(null)
          setEstimatedSize(null)
        })
    }, 500)

    return () => clearTimeout(timer)
  }, [format, quality, layers, documentWidth, documentHeight, documentBackground])

  useEffect(() => {
    return () => {
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current)
    }
  }, [])

  const handleExport = async () => {
    setExporting(true)
    setFallbackWarning(false)
    try {
      const result = await exportCanvas({
        format,
        quality,
        filename,
        width: documentWidth,
        height: documentHeight,
        background: documentBackground,
        layers,
      })
      if (result.usedFallback) {
        setFallbackWarning(true)
      } else {
        onClose()
      }
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Preview */}
      <div className="flex flex-col items-center gap-1.5">
        <div
          className="flex items-center justify-center rounded-md border border-white/8 bg-neutral-900"
          style={{ minHeight: 120, maxHeight: PREVIEW_MAX }}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Export preview"
              className="max-h-[200px] rounded-sm object-contain"
              style={{ maxWidth: PREVIEW_MAX }}
            />
          ) : (
            <span className="px-8 py-10 text-xs text-neutral-500">Generating preview...</span>
          )}
        </div>
        {estimatedSize !== null && (
          <span className="text-xs text-neutral-400">
            Estimated size: {formatFileSize(estimatedSize)}
          </span>
        )}
      </div>

      {/* Format toggle */}
      <div>
        <label className="mb-1.5 block text-xs text-neutral-400">Format</label>
        <div className="flex gap-1 rounded-lg border border-white/8 p-1">
          {(['png', 'jpeg'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                format === f ? 'bg-blue-500/20 text-blue-400' : 'text-neutral-400 hover:text-white',
              )}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* JPEG quality */}
      {format === 'jpeg' && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs text-neutral-400">Quality</label>
            <span className="text-xs text-neutral-400">{quality}%</span>
          </div>
          <Slider min={1} max={100} value={[quality]} onValueChange={([v]) => setQuality(v)} />
        </div>
      )}

      {/* Filename */}
      <div>
        <label className="mb-1.5 block text-xs text-neutral-400">Filename</label>
        <Input
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          placeholder="vizpix-export"
        />
      </div>

      {/* Dimensions (read-only) */}
      <div className="rounded-md border border-white/8 px-3 py-2 text-xs text-neutral-400">
        <span className="font-medium text-neutral-300">Dimensions: </span>
        {documentWidth} &times; {documentHeight} px
      </div>

      {/* Fallback warning */}
      {fallbackWarning && (
        <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
          Export used fallback renderer. Some blend modes and masks may look different.
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleExport} disabled={exporting || !filename.trim()}>
          {exporting ? 'Exporting...' : 'Export'}
        </Button>
      </div>
    </div>
  )
}

export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const { isMobile } = useResponsive()
  const handleClose = () => onOpenChange(false)

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Export</DrawerTitle>
            <DrawerDescription>Export your canvas as an image</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4">
            <ExportForm onClose={handleClose} />
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>Export your canvas as an image</DialogDescription>
        </DialogHeader>
        <ExportForm onClose={handleClose} />
      </DialogContent>
    </Dialog>
  )
}
