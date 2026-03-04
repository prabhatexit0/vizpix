import { Toolbar } from './toolbar'
import { RightPanel } from './right-panel'
import { EditorCanvas } from '@/components/canvas/editor-canvas'
import { TooltipProvider } from '@/components/ui/tooltip'

export function EditorLayout() {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen w-screen overflow-hidden bg-neutral-950 text-white">
        <Toolbar />
        <EditorCanvas />
        <RightPanel />
      </div>
    </TooltipProvider>
  )
}
