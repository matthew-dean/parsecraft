import type { Parser, ParseContext, ParseResult } from '../types.ts'
import { buildLineIndex, annotateSpan } from '../compiler/line-index.ts'

export type GrammarOptions = {
  trivia?: Parser<unknown>
  trackLines?: boolean
}

export function grammar<T>(opts: GrammarOptions, root: Parser<T>): Parser<T> {
  return {
    _tag: 'grammar',
    _meta: root._meta,
    _def: {
      tag: 'grammar',
      parser: root as Parser<unknown>,
      triviaParser: opts.trivia,
      trackLines: opts.trackLines ?? false,
    },
    parse(input: string, pos: number, _ctx: ParseContext): ParseResult<T> {
      const trackLines = opts.trackLines ?? false
      const ctx: ParseContext = opts.trivia !== undefined
        ? { trivia: opts.trivia, trackLines }
        : { trackLines }
      const result = root.parse(input, pos, ctx)
      if (trackLines) {
        const idx = buildLineIndex(input)
        return { ...result, span: annotateSpan(result.span, idx) }
      }
      return result
    },
  }
}

export function parse<T>(
  parser: Parser<T>,
  input: string,
  opts: GrammarOptions = {}
): ParseResult<T> {
  const trackLines = opts.trackLines ?? false
  const ctx: ParseContext = opts.trivia !== undefined
    ? { trivia: opts.trivia, trackLines }
    : { trackLines }
  const result = parser.parse(input, 0, ctx)
  if (trackLines) {
    const idx = buildLineIndex(input)
    return { ...result, span: annotateSpan(result.span, idx) }
  }
  return result
}
