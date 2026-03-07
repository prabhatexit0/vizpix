import type { TextRun, TextLayer, Fill } from '@/store/types'

export function getPlainText(runs: TextRun[]): string {
  return runs.map((r) => r.text).join('')
}

export function runsFromPlainText(text: string): TextRun[] {
  return [{ text }]
}

export function splitRunsAtIndex(runs: TextRun[], index: number): [TextRun[], TextRun[]] {
  const before: TextRun[] = []
  const after: TextRun[] = []
  let offset = 0

  for (const run of runs) {
    const runEnd = offset + run.text.length
    if (runEnd <= index) {
      before.push(run)
    } else if (offset >= index) {
      after.push(run)
    } else {
      const splitAt = index - offset
      before.push({ ...run, text: run.text.slice(0, splitAt) })
      after.push({ ...run, text: run.text.slice(splitAt) })
    }
    offset = runEnd
  }

  return [before, after]
}

export function migrateTextLayerRuns(layer: { content?: string; runs?: TextRun[] }): TextRun[] {
  if (layer.runs && layer.runs.length > 0) return layer.runs
  return [{ text: layer.content ?? '' }]
}

type TextRunFormatting = Omit<TextRun, 'text'>
const FORMAT_KEYS: (keyof TextRunFormatting)[] = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fill',
  'letterSpacing',
  'textDecoration',
]

function runsHaveSameFormatting(a: TextRun, b: TextRun): boolean {
  for (const key of FORMAT_KEYS) {
    const av = a[key]
    const bv = b[key]
    if (av === bv) continue
    if (av === undefined && bv === undefined) continue
    if (typeof av === 'object' && typeof bv === 'object') {
      if (JSON.stringify(av) !== JSON.stringify(bv)) return false
    } else {
      return false
    }
  }
  return true
}

export function mergeAdjacentRuns(runs: TextRun[]): TextRun[] {
  if (runs.length <= 1) return runs
  const merged: TextRun[] = [{ ...runs[0] }]
  for (let i = 1; i < runs.length; i++) {
    const prev = merged[merged.length - 1]
    if (runsHaveSameFormatting(prev, runs[i])) {
      prev.text += runs[i].text
    } else {
      merged.push({ ...runs[i] })
    }
  }
  return merged
}

export function applyFormattingToSelection(
  runs: TextRun[],
  selStart: number,
  selEnd: number,
  props: Partial<TextRunFormatting>,
): TextRun[] {
  if (selStart >= selEnd) return runs

  const result: TextRun[] = []
  let offset = 0

  for (const run of runs) {
    const runStart = offset
    const runEnd = offset + run.text.length
    offset = runEnd

    if (runEnd <= selStart || runStart >= selEnd) {
      result.push({ ...run })
      continue
    }

    // Split before selection
    if (runStart < selStart) {
      result.push({ ...run, text: run.text.slice(0, selStart - runStart) })
    }

    // Selected portion
    const sliceStart = Math.max(0, selStart - runStart)
    const sliceEnd = Math.min(run.text.length, selEnd - runStart)
    result.push({ ...run, ...props, text: run.text.slice(sliceStart, sliceEnd) })

    // Split after selection
    if (runEnd > selEnd) {
      result.push({ ...run, text: run.text.slice(selEnd - runStart) })
    }
  }

  return mergeAdjacentRuns(result)
}

export function removeFormattingFromSelection(
  runs: TextRun[],
  selStart: number,
  selEnd: number,
  keys: (keyof TextRunFormatting)[],
): TextRun[] {
  if (selStart >= selEnd) return runs

  const result: TextRun[] = []
  let offset = 0

  for (const run of runs) {
    const runStart = offset
    const runEnd = offset + run.text.length
    offset = runEnd

    if (runEnd <= selStart || runStart >= selEnd) {
      result.push({ ...run })
      continue
    }

    if (runStart < selStart) {
      result.push({ ...run, text: run.text.slice(0, selStart - runStart) })
    }

    const sliceStart = Math.max(0, selStart - runStart)
    const sliceEnd = Math.min(run.text.length, selEnd - runStart)
    const cleaned = { ...run, text: run.text.slice(sliceStart, sliceEnd) }
    for (const key of keys) {
      delete cleaned[key]
    }
    result.push(cleaned)

    if (runEnd > selEnd) {
      result.push({ ...run, text: run.text.slice(selEnd - runStart) })
    }
  }

  return mergeAdjacentRuns(result)
}

export interface SelectionFormatting {
  mixed: boolean
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  fontStyle?: 'normal' | 'italic'
  fill?: Fill
  letterSpacing?: number
  textDecoration?: 'none' | 'underline' | 'strikethrough'
}

export function getFormattingAtSelection(
  runs: TextRun[],
  selStart: number,
  selEnd: number,
): SelectionFormatting {
  if (selStart >= selEnd) {
    // Point cursor — return formatting of the run at that position
    let offset = 0
    for (const run of runs) {
      const runEnd = offset + run.text.length
      if (offset <= selStart && selStart <= runEnd && run.text.length > 0) {
        return {
          mixed: false,
          fontFamily: run.fontFamily,
          fontSize: run.fontSize,
          fontWeight: run.fontWeight,
          fontStyle: run.fontStyle,
          fill: run.fill,
          letterSpacing: run.letterSpacing,
          textDecoration: run.textDecoration,
        }
      }
      offset = runEnd
    }
    return { mixed: false }
  }

  // Collect all runs that overlap the selection
  const overlapping: TextRun[] = []
  let offset = 0
  for (const run of runs) {
    const runStart = offset
    const runEnd = offset + run.text.length
    offset = runEnd
    if (runEnd <= selStart || runStart >= selEnd) continue
    if (run.text.length === 0) continue
    overlapping.push(run)
  }

  if (overlapping.length === 0) return { mixed: false }
  if (overlapping.length === 1) {
    const r = overlapping[0]
    return {
      mixed: false,
      fontFamily: r.fontFamily,
      fontSize: r.fontSize,
      fontWeight: r.fontWeight,
      fontStyle: r.fontStyle,
      fill: r.fill,
      letterSpacing: r.letterSpacing,
      textDecoration: r.textDecoration,
    }
  }

  // Multiple runs — check each property for consistency
  const result: SelectionFormatting = { mixed: false }
  const first = overlapping[0]

  for (const key of FORMAT_KEYS) {
    const firstVal = first[key]
    let allSame = true
    for (let i = 1; i < overlapping.length; i++) {
      const val = overlapping[i][key]
      if (firstVal === val) continue
      if (typeof firstVal === 'object' && typeof val === 'object') {
        if (JSON.stringify(firstVal) !== JSON.stringify(val)) {
          allSame = false
          break
        }
      } else {
        allSame = false
        break
      }
    }
    if (allSame) {
      ;(result as unknown as Record<string, unknown>)[key] = firstVal
    } else {
      result.mixed = true
    }
  }

  return result
}

export function insertTextAtCursor(
  runs: TextRun[],
  index: number,
  text: string,
  pendingFormat?: Partial<Omit<TextRun, 'text'>> | null,
): TextRun[] {
  if (text.length === 0) return runs

  if (pendingFormat) {
    const [before, after] = splitRunsAtIndex(runs, index)
    const newRun: TextRun = { ...pendingFormat, text }
    return mergeAdjacentRuns([...before, newRun, ...after])
  }

  // Insert into the run at cursor position (left run at boundary, matching Figma)
  let offset = 0
  const result: TextRun[] = []
  let inserted = false

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i]
    const runEnd = offset + run.text.length

    if (!inserted && index <= runEnd && index >= offset) {
      // Insert into this run
      const pos = index - offset
      result.push({ ...run, text: run.text.slice(0, pos) + text + run.text.slice(pos) })
      inserted = true
    } else {
      result.push({ ...run })
    }
    offset = runEnd
  }

  // If cursor is past all runs (e.g., empty runs array), append
  if (!inserted) {
    if (result.length > 0) {
      const last = result[result.length - 1]
      last.text += text
    } else {
      result.push({ text })
    }
  }

  return result
}

export function deleteTextAtRange(runs: TextRun[], start: number, end: number): TextRun[] {
  if (start >= end) return runs

  const result: TextRun[] = []
  let offset = 0

  for (const run of runs) {
    const runStart = offset
    const runEnd = offset + run.text.length
    offset = runEnd

    if (runEnd <= start || runStart >= end) {
      // Entirely outside deletion range
      result.push({ ...run })
    } else {
      // Partially or fully inside deletion range
      const keepBefore = run.text.slice(0, Math.max(0, start - runStart))
      const keepAfter = run.text.slice(Math.min(run.text.length, end - runStart))
      const remaining = keepBefore + keepAfter
      if (remaining.length > 0) {
        result.push({ ...run, text: remaining })
      }
    }
  }

  return mergeAdjacentRuns(result)
}

export interface RunSegment {
  run: TextRun
  text: string
  startOffset: number
  width: number
  font: string
  fontSize: number
  letterSpacing: number
}

export interface TextLine {
  segments: RunSegment[]
  lineHeight: number
  width: number
  yOffset: number
  startOffset: number
}

export function resolveRunFont(run: TextRun, layer: TextLayer): string {
  return `${run.fontStyle ?? layer.fontStyle} ${run.fontWeight ?? layer.fontWeight} ${run.fontSize ?? layer.fontSize}px ${run.fontFamily ?? layer.fontFamily}`
}

function setLetterSpacing(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ls: number,
): void {
  if ('letterSpacing' in ctx) {
    ;(ctx as CanvasRenderingContext2D).letterSpacing = `${ls}px`
  }
}

export function layoutTextRuns(layer: TextLayer): TextLine[] {
  const canvas = new OffscreenCanvas(1, 1)
  const ctx = canvas.getContext('2d')!

  const lines: TextLine[] =
    layer.boxWidth !== null ? layoutWithWordWrap(ctx, layer) : layoutWithNewlines(ctx, layer)

  let y = 0
  for (const line of lines) {
    line.yOffset = y
    y += line.lineHeight
  }

  return lines
}

function finalizeLine(segments: RunSegment[], layer: TextLayer, startOffset: number): TextLine {
  let width = 0
  let maxFontSize = 0
  for (const seg of segments) {
    width += seg.width
    maxFontSize = Math.max(maxFontSize, seg.fontSize)
  }
  if (maxFontSize === 0) maxFontSize = layer.fontSize
  return {
    segments,
    width,
    lineHeight: maxFontSize * layer.lineHeight,
    yOffset: 0,
    startOffset: segments.length > 0 ? segments[0].startOffset : startOffset,
  }
}

function layoutWithNewlines(ctx: OffscreenCanvasRenderingContext2D, layer: TextLayer): TextLine[] {
  const lines: TextLine[] = []
  let currentLine: RunSegment[] = []
  let flatOffset = 0

  for (const run of layer.runs) {
    if (!run.text) continue
    const font = resolveRunFont(run, layer)
    const fs = run.fontSize ?? layer.fontSize
    const ls = run.letterSpacing ?? layer.letterSpacing
    ctx.font = font
    setLetterSpacing(ctx, ls)

    const parts = run.text.split('\n')
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        lines.push(finalizeLine(currentLine, layer, flatOffset))
        currentLine = []
        flatOffset++
      }
      const text = parts[i]
      if (text.length > 0) {
        const width = ctx.measureText(text).width
        currentLine.push({
          run,
          text,
          startOffset: flatOffset,
          width,
          font,
          fontSize: fs,
          letterSpacing: ls,
        })
      }
      flatOffset += text.length
    }
  }

  lines.push(finalizeLine(currentLine, layer, flatOffset))
  return lines
}

interface TextAtom {
  run: TextRun
  text: string
  flatOffset: number
  width: number
  font: string
  fontSize: number
  letterSpacing: number
  kind: 'word' | 'space' | 'newline'
}

function addAtomToLine(line: RunSegment[], atom: TextAtom): void {
  const last = line.length > 0 ? line[line.length - 1] : null
  if (last && last.run === atom.run && last.startOffset + last.text.length === atom.flatOffset) {
    last.text += atom.text
    last.width += atom.width
  } else {
    line.push({
      run: atom.run,
      text: atom.text,
      startOffset: atom.flatOffset,
      width: atom.width,
      font: atom.font,
      fontSize: atom.fontSize,
      letterSpacing: atom.letterSpacing,
    })
  }
}

function layoutWithWordWrap(ctx: OffscreenCanvasRenderingContext2D, layer: TextLayer): TextLine[] {
  const maxWidth = layer.boxWidth!

  const atoms: TextAtom[] = []
  let flatOffset = 0

  for (const run of layer.runs) {
    if (!run.text) continue
    const font = resolveRunFont(run, layer)
    const fs = run.fontSize ?? layer.fontSize
    const ls = run.letterSpacing ?? layer.letterSpacing
    ctx.font = font
    setLetterSpacing(ctx, ls)

    let i = 0
    while (i < run.text.length) {
      if (run.text[i] === '\n') {
        atoms.push({
          run,
          text: '\n',
          flatOffset: flatOffset + i,
          width: 0,
          font,
          fontSize: fs,
          letterSpacing: ls,
          kind: 'newline',
        })
        i++
      } else if (run.text[i] === ' ') {
        let j = i + 1
        while (j < run.text.length && run.text[j] === ' ') j++
        const text = run.text.slice(i, j)
        atoms.push({
          run,
          text,
          flatOffset: flatOffset + i,
          width: ctx.measureText(text).width,
          font,
          fontSize: fs,
          letterSpacing: ls,
          kind: 'space',
        })
        i = j
      } else {
        let j = i + 1
        while (j < run.text.length && run.text[j] !== ' ' && run.text[j] !== '\n') j++
        const text = run.text.slice(i, j)
        atoms.push({
          run,
          text,
          flatOffset: flatOffset + i,
          width: ctx.measureText(text).width,
          font,
          fontSize: fs,
          letterSpacing: ls,
          kind: 'word',
        })
        i = j
      }
    }
    flatOffset += run.text.length
  }

  // Group consecutive word atoms into word groups for wrapping
  interface Token {
    kind: 'words' | 'space' | 'newline'
    atoms: TextAtom[]
    width: number
  }
  const tokens: Token[] = []
  let ti = 0
  while (ti < atoms.length) {
    const atom = atoms[ti]
    if (atom.kind === 'newline') {
      tokens.push({ kind: 'newline', atoms: [atom], width: 0 })
      ti++
    } else if (atom.kind === 'space') {
      tokens.push({ kind: 'space', atoms: [atom], width: atom.width })
      ti++
    } else {
      const group: TextAtom[] = []
      let w = 0
      while (ti < atoms.length && atoms[ti].kind === 'word') {
        group.push(atoms[ti])
        w += atoms[ti].width
        ti++
      }
      tokens.push({ kind: 'words', atoms: group, width: w })
    }
  }

  const lines: TextLine[] = []
  let currentLine: RunSegment[] = []
  let lineWidth = 0
  let lineStartOffset = 0
  let pendingSpace: TextAtom | null = null

  for (const token of tokens) {
    if (token.kind === 'newline') {
      lines.push(finalizeLine(currentLine, layer, lineStartOffset))
      currentLine = []
      lineWidth = 0
      lineStartOffset = token.atoms[0].flatOffset + 1
      pendingSpace = null
      continue
    }

    if (token.kind === 'space') {
      if (lineWidth > 0) {
        pendingSpace = token.atoms[0]
      }
      continue
    }

    // Word group
    const spaceWidth = pendingSpace ? pendingSpace.width : 0
    if (lineWidth + spaceWidth + token.width > maxWidth && lineWidth > 0) {
      lines.push(finalizeLine(currentLine, layer, lineStartOffset))
      currentLine = []
      lineWidth = 0
      lineStartOffset = token.atoms[0].flatOffset
      pendingSpace = null
    }

    if (pendingSpace && lineWidth > 0) {
      addAtomToLine(currentLine, pendingSpace)
      lineWidth += pendingSpace.width
    }
    pendingSpace = null

    for (const atom of token.atoms) {
      addAtomToLine(currentLine, atom)
      lineWidth += atom.width
    }
  }

  lines.push(finalizeLine(currentLine, layer, lineStartOffset))
  return lines
}
