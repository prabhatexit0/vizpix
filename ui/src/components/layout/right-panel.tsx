import { useEditorStore } from '@/store'
import { useResponsive } from '@/hooks/use-responsive'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer'
import { LayersPanel } from '@/components/panels/layers-panel'
import { PropertiesPanel } from '@/components/panels/properties-panel'
import { AdjustPanel } from '@/components/panels/adjust-panel'
import { PanelRight } from 'lucide-react'
import { useState, useCallback, useRef } from 'react'

const MIN_WIDTH = 220
const MAX_WIDTH = 480
const DEFAULT_WIDTH = 280

function PanelTabs() {
  const activePanel = useEditorStore((s) => s.activePanel)
  const setActivePanel = useEditorStore((s) => s.setActivePanel)

  return (
    <Tabs
      value={activePanel}
      onValueChange={setActivePanel}
      className="flex h-full min-w-0 flex-col"
    >
      <TabsList className="grid w-full shrink-0 grid-cols-3 rounded-none border-b border-white/15 bg-transparent">
        <TabsTrigger
          value="layers"
          className="text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white"
        >
          Layers
        </TabsTrigger>
        <TabsTrigger
          value="properties"
          className="text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white"
        >
          Props
        </TabsTrigger>
        <TabsTrigger
          value="adjust"
          className="text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white"
        >
          Adjust
        </TabsTrigger>
      </TabsList>
      <div className="flex-1 overflow-hidden">
        <TabsContent value="layers" className="m-0 h-full">
          <LayersPanel />
        </TabsContent>
        <TabsContent value="properties" className="m-0 h-full">
          <PropertiesPanel />
        </TabsContent>
        <TabsContent value="adjust" className="m-0 h-full">
          <AdjustPanel />
        </TabsContent>
      </div>
    </Tabs>
  )
}

function ResizeHandle({ onResize }: { onResize: (deltaX: number) => void }) {
  const dragging = useRef(false)
  const lastX = useRef(0)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    dragging.current = true
    lastX.current = e.clientX
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return
      const dx = e.clientX - lastX.current
      lastX.current = e.clientX
      onResize(dx)
    },
    [onResize],
  )

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragging.current = false
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
  }, [])

  return (
    <div
      className="absolute top-0 left-0 z-10 h-full w-1.5 cursor-col-resize transition-colors select-none hover:bg-blue-500/40 active:bg-blue-500/60"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ touchAction: 'none' }}
    />
  )
}

export function RightPanel() {
  const { isMobile } = useResponsive()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [width, setWidth] = useState(DEFAULT_WIDTH)

  const handleResize = useCallback((dx: number) => {
    // Dragging left (negative dx) should increase width, right should decrease
    setWidth((w) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w - dx)))
  }, [])

  if (isMobile) {
    return (
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerTrigger asChild>
          <button className="absolute top-4 right-4 z-50 rounded-lg border border-white/10 bg-neutral-900/90 p-2 text-neutral-400 backdrop-blur-md hover:text-white">
            <PanelRight size={18} />
          </button>
        </DrawerTrigger>
        <DrawerContent className="max-h-[70vh]">
          <div className="h-[60vh]">
            <PanelTabs />
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <div
      className="relative flex shrink-0 flex-col border-l border-white/[.15] bg-neutral-900"
      style={{ width }}
    >
      <ResizeHandle onResize={handleResize} />
      <PanelTabs />
    </div>
  )
}
