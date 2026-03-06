import { useCallback } from 'react'
import { Toolbar } from './toolbar'
import { RightPanel } from './right-panel'
import { EditorCanvas } from '@/components/canvas/editor-canvas'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ShortcutsDialog } from '@/components/dialogs/shortcuts-dialog'
import { ConfirmDialog } from '@/components/dialogs/confirm-dialog'
import { useEditorStore } from '@/store'

export function EditorLayout() {
  const pendingDeleteLayerId = useEditorStore((s) => s.pendingDeleteLayerId)
  const setPendingDeleteLayerId = useEditorStore((s) => s.setPendingDeleteLayerId)
  const removeLayer = useEditorStore((s) => s.removeLayer)

  const handleConfirmDelete = useCallback(() => {
    if (pendingDeleteLayerId) {
      removeLayer(pendingDeleteLayerId)
      setPendingDeleteLayerId(null)
    }
  }, [pendingDeleteLayerId, removeLayer, setPendingDeleteLayerId])

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen w-screen overflow-hidden bg-neutral-950 pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] text-white">
        <Toolbar />
        <EditorCanvas />
        <RightPanel />
      </div>
      <ShortcutsDialog />
      <ConfirmDialog
        open={pendingDeleteLayerId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteLayerId(null)
        }}
        onConfirm={handleConfirmDelete}
        title="Delete last layer?"
        description="This is the only layer on the canvas. Deleting it will leave the canvas empty. You can undo this action."
        confirmLabel="Delete"
      />
    </TooltipProvider>
  )
}
