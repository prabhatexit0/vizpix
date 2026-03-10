import { useEditorStore } from '@/store'
import { useResponsive } from '@/hooks/use-responsive'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Drawer, DrawerContent } from '@/components/ui/drawer'
import { LayersPanel } from '@/components/panels/layers-panel'
import { PropertiesPanel } from '@/components/panels/properties-panel'
import { AdjustPanel } from '@/components/panels/adjust-panel'
import { PanelRight } from 'lucide-react'
import { useState, useCallback, useRef, useEffect } from 'react'

const MIN_WIDTH = 220
const MAX_WIDTH = 480
const DEFAULT_WIDTH = 280
const TABLET_MIN_WIDTH = 200
const TABLET_MAX_WIDTH = 320
const TABLET_DEFAULT_WIDTH = 200

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
      <div className="min-h-0 flex-1">
        <TabsContent value="layers" className="m-0 h-full overflow-y-auto">
          <LayersPanel />
        </TabsContent>
        <TabsContent value="properties" className="m-0 h-full overflow-y-auto">
          <PropertiesPanel />
        </TabsContent>
        <TabsContent value="adjust" className="m-0 h-full overflow-y-auto">
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
      className="absolute top-0 -left-1.5 z-10 h-full w-3 cursor-col-resize transition-colors select-none hover:bg-blue-500/40 active:bg-blue-500/60"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ touchAction: 'none' }}
    />
  )
}

export function RightPanel() {
  const { isMobile, isTablet } = useResponsive()
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [tabletWidth, setTabletWidth] = useState(TABLET_DEFAULT_WIDTH)

  const handleResize = useCallback((dx: number) => {
    setWidth((w) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w - dx)))
  }, [])

  const handleTabletResize = useCallback((dx: number) => {
    setTabletWidth((w) => Math.min(TABLET_MAX_WIDTH, Math.max(TABLET_MIN_WIDTH, w - dx)))
  }, [])

  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    if (!isMobile) return
    let prevId = useEditorStore.getState().activeLayerId
    return useEditorStore.subscribe((state) => {
      if (state.activeLayerId !== prevId) {
        prevId = state.activeLayerId
        if (state.editingTextLayerId) return
        setDrawerOpen(state.activeLayerId !== null)
      }
    })
  }, [isMobile])

  const handleDrawerChange = useCallback((open: boolean) => {
    setDrawerOpen(open)
  }, [])

  if (isMobile) {
    return (
      <>
        <button
          onClick={() => setDrawerOpen(true)}
          className="absolute top-4 right-[env(safe-area-inset-right)] z-50 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-l-lg border border-r-0 border-white/10 bg-neutral-900/90 text-neutral-400 backdrop-blur-md hover:text-white"
        >
          <PanelRight size={18} />
        </button>
        <Drawer direction="right" noBodyStyles open={drawerOpen} onOpenChange={handleDrawerChange}>
          <DrawerContent className="h-full" onOverlayClick={() => setDrawerOpen(false)}>
            <div className="flex h-full flex-col pr-[env(safe-area-inset-right)]">
              <PanelTabs />
            </div>
          </DrawerContent>
        </Drawer>
      </>
    )
  }

  if (isTablet) {
    return (
      <div
        className="relative flex shrink-0 flex-col border-l border-white/15 bg-neutral-900"
        style={{ width: tabletWidth }}
      >
        <ResizeHandle onResize={handleTabletResize} />
        <PanelTabs />
      </div>
    )
  }

  return (
    <div
      className="relative flex shrink-0 flex-col border-l border-white/15 bg-neutral-900"
      style={{ width }}
    >
      <ResizeHandle onResize={handleResize} />
      <PanelTabs />
    </div>
  )
}
