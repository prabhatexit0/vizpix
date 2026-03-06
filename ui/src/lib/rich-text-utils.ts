import type { TextRun, TextLayer } from '@/store/types'

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
