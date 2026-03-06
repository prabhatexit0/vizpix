import { useEditorStore } from '@/store'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const SHORTCUTS = [
  { section: 'Tools' },
  { key: 'V', label: 'Pointer' },
  { key: 'H', label: 'Hand' },
  { key: 'Z', label: 'Zoom' },
  { key: 'C', label: 'Crop' },
  { key: 'R', label: 'Rectangle' },
  { key: 'E', label: 'Ellipse' },
  { key: 'T', label: 'Text' },
  { key: 'Space', label: 'Hold for Hand tool' },
  { section: 'Layers' },
  { key: 'Delete', label: 'Remove layer' },
  { key: '\u2318/Ctrl + D', label: 'Duplicate layer' },
  { key: '\u2318/Ctrl + J', label: 'Duplicate layer (alt)' },
  { key: ']', label: 'Move layer up' },
  { key: '[', label: 'Move layer down' },
  { key: '\u2318/Ctrl + G', label: 'Group layers' },
  { key: '\u2318/Ctrl + Shift + G', label: 'Ungroup' },
  { section: 'Edit' },
  { key: '\u2318/Ctrl + Z', label: 'Undo' },
  { key: '\u2318/Ctrl + Shift + Z', label: 'Redo' },
  { key: '\u2318/Ctrl + C', label: 'Copy layer' },
  { key: '\u2318/Ctrl + V', label: 'Paste layer' },
  { key: '\u2318/Ctrl + X', label: 'Cut layer' },
  { section: 'Text' },
  { key: 'Enter', label: 'Edit selected text' },
  { key: 'Escape', label: 'Stop editing' },
  { section: 'View' },
  { key: '\u2318/Ctrl + +', label: 'Zoom in' },
  { key: '\u2318/Ctrl + -', label: 'Zoom out' },
  { key: '\u2318/Ctrl + 0', label: 'Reset zoom' },
  { key: '\u2318/Ctrl + Shift + F', label: 'Fit to canvas' },
  { key: '?', label: 'Show shortcuts' },
] as const

export function ShortcutsDialog() {
  const showShortcuts = useEditorStore((s) => s.showShortcuts)
  const setShowShortcuts = useEditorStore((s) => s.setShowShortcuts)

  return (
    <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          {SHORTCUTS.map((item, i) =>
            'section' in item ? (
              <div
                key={i}
                className="pt-3 pb-1 text-xs font-semibold tracking-wider text-neutral-400 uppercase"
              >
                {item.section}
              </div>
            ) : (
              <div
                key={i}
                className="flex items-center justify-between rounded px-2 py-1.5 text-sm"
              >
                <span className="text-neutral-300">{item.label}</span>
                <kbd className="rounded bg-white/10 px-2 py-0.5 font-mono text-xs text-neutral-400">
                  {item.key}
                </kbd>
              </div>
            ),
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
