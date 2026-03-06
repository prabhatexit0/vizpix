import { useEditorStore } from '@/store'
import { LayerItem } from './layer-item'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ImagePlus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCallback, useState } from 'react'

export function LayersPanel() {
  const layers = useEditorStore((s) => s.layers)
  const addLayer = useEditorStore((s) => s.addLayer)
  const reorderLayers = useEditorStore((s) => s.reorderLayers)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

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

  const handleDragStart = useCallback((layerId: string) => {
    setDragId(layerId)
  }, [])

  const handleDragOver = useCallback(
    (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault()
      if (dragId === null) return
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const midY = rect.top + rect.height / 2
      // In the reversed list, above midpoint = higher index, below = same index
      const idx = e.clientY < midY ? targetIndex + 1 : targetIndex
      setDropIndex(idx)
    },
    [dragId],
  )

  const handleDrop = useCallback(() => {
    if (dragId !== null && dropIndex !== null) {
      const fromIndex = layers.findIndex((l) => l.id === dragId)
      if (fromIndex !== -1 && fromIndex !== dropIndex) {
        const adjustedIndex = dropIndex > fromIndex ? dropIndex - 1 : dropIndex
        reorderLayers(dragId, adjustedIndex, null)
      }
    }
    setDragId(null)
    setDropIndex(null)
  }, [dragId, dropIndex, layers, reorderLayers])

  const handleDragEnd = useCallback(() => {
    setDragId(null)
    setDropIndex(null)
  }, [])

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b p-2">
        <span className="text-xs font-medium text-neutral-300">Layers</span>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleAddImage}>
          <Plus size={14} />
        </Button>
      </div>
      <ScrollArea className="flex-1 p-2">
        <div className="flex flex-col-reverse gap-1">
          {layers.map((layer, i) => (
            <div
              key={layer.id}
              draggable
              onDragStart={() => handleDragStart(layer.id)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              className="relative"
            >
              {dropIndex === i && dragId !== null && dragId !== layer.id && (
                <div className="absolute inset-x-0 bottom-0 z-10 h-0.5 bg-blue-500" />
              )}
              {dropIndex === i + 1 && dragId !== null && dragId !== layer.id && (
                <div className="absolute inset-x-0 top-0 z-10 h-0.5 bg-blue-500" />
              )}
              <LayerItem layerId={layer.id} />
            </div>
          ))}
        </div>
        {layers.length === 0 && (
          <button
            onClick={handleAddImage}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/12 py-8 text-neutral-500 transition-colors hover:border-white/25 hover:text-neutral-400"
          >
            <ImagePlus size={28} strokeWidth={1.5} />
            <span className="text-xs">Add an image to get started</span>
          </button>
        )}
      </ScrollArea>
    </div>
  )
}
