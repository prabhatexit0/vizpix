import type { TextRun } from '@/store/types'

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
