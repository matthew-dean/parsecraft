import type { Span } from '../types.ts'

/**
 * Precomputed index of newline positions for O(log n) offset→line/col lookup.
 * lineStarts[i] is the byte offset of the first character on line i+1.
 */
export type LineIndex = { lineStarts: number[] }

export function buildLineIndex(input: string): LineIndex {
  const lineStarts = [0]
  for (let i = 0; i < input.length; i++) {
    if (input.charCodeAt(i) === 10) lineStarts.push(i + 1)
  }
  return { lineStarts }
}

export function offsetToLineCol(
  index: LineIndex,
  offset: number
): { line: number; col: number } {
  const { lineStarts } = index
  let lo = 0
  let hi = lineStarts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (lineStarts[mid]! <= offset) lo = mid
    else hi = mid - 1
  }
  return { line: lo + 1, col: offset - lineStarts[lo]! + 1 }
}

/** Fills startLine/startColumn/endLine/endColumn on a span in-place. */
export function annotateSpan(span: Span, index: LineIndex): Span {
  const s = offsetToLineCol(index, span.start)
  const e = offsetToLineCol(index, span.end)
  return {
    ...span,
    startLine: s.line,
    startColumn: s.col,
    endLine: e.line,
    endColumn: e.col,
  }
}
