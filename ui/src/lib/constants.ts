import type { BlendMode, ToolMode } from '@/store/types'

export const TOOL_DEFINITIONS: { mode: ToolMode; label: string; shortcut: string }[] = [
  { mode: 'pointer', label: 'Pointer', shortcut: 'V' },
  { mode: 'hand', label: 'Hand', shortcut: 'H' },
  { mode: 'zoom', label: 'Zoom', shortcut: 'Z' },
  { mode: 'crop', label: 'Crop', shortcut: 'C' },
]

export const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'color-dodge', label: 'Color Dodge' },
  { value: 'color-burn', label: 'Color Burn' },
  { value: 'hard-light', label: 'Hard Light' },
  { value: 'soft-light', label: 'Soft Light' },
  { value: 'difference', label: 'Difference' },
  { value: 'exclusion', label: 'Exclusion' },
]

export const KEYBOARD_SHORTCUTS: Record<string, string> = {
  v: 'pointer',
  h: 'hand',
  z: 'zoom',
  c: 'crop',
  ' ': 'temp-hand',
  Delete: 'delete-layer',
  Backspace: 'delete-layer',
  'Ctrl+c': 'copy-layer',
  'Ctrl+v': 'paste-layer',
  'Ctrl+x': 'cut-layer',
  'Ctrl+j': 'duplicate-layer',
  'Ctrl+d': 'deselect',
  'Ctrl+z': 'undo',
  'Ctrl+Shift+z': 'redo',
  'Ctrl+=': 'zoom-in',
  'Ctrl+-': 'zoom-out',
  'Ctrl+0': 'reset-zoom',
  'Ctrl+Shift+f': 'fit-to-viewport',
  '[': 'layer-down',
  ']': 'layer-up',
  'Alt+[': 'select-prev-layer',
  'Alt+]': 'select-next-layer',
}

export const ZOOM_MIN = 0.1
export const ZOOM_MAX = 10
export const ZOOM_STEP = 0.1
export const HISTORY_MAX = 30
export const MOBILE_BREAKPOINT = 1024

export const MIN_CANVAS_SIZE = 1
export const MAX_CANVAS_SIZE = 8192

export interface CanvasSizePreset {
  label: string
  width: number
  height: number
  category: 'Social Media' | 'Standard' | 'Square'
}

export const CANVAS_SIZE_PRESETS: CanvasSizePreset[] = [
  // Social Media
  { label: 'Instagram Post', width: 1080, height: 1080, category: 'Social Media' },
  { label: 'Instagram Story', width: 1080, height: 1920, category: 'Social Media' },
  { label: 'Twitter Post', width: 1200, height: 675, category: 'Social Media' },
  { label: 'Twitter Header', width: 1500, height: 500, category: 'Social Media' },
  { label: 'Facebook Post', width: 1200, height: 630, category: 'Social Media' },
  { label: 'YouTube Thumbnail', width: 1280, height: 720, category: 'Social Media' },
  { label: 'LinkedIn Post', width: 1200, height: 627, category: 'Social Media' },

  // Standard
  { label: 'HD (720p)', width: 1280, height: 720, category: 'Standard' },
  { label: 'Full HD (1080p)', width: 1920, height: 1080, category: 'Standard' },
  { label: '2K', width: 2560, height: 1440, category: 'Standard' },
  { label: '4K', width: 3840, height: 2160, category: 'Standard' },
  { label: 'A4 (300 DPI)', width: 2480, height: 3508, category: 'Standard' },

  // Square
  { label: '512 x 512', width: 512, height: 512, category: 'Square' },
  { label: '1024 x 1024', width: 1024, height: 1024, category: 'Square' },
  { label: '2048 x 2048', width: 2048, height: 2048, category: 'Square' },
]
