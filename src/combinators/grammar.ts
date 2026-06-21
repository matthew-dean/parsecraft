import type { Parser, ParseContext, ParseResult } from '../types.ts'

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
      const ctx: ParseContext = opts.trivia !== undefined
        ? { trivia: opts.trivia, trackLines: opts.trackLines ?? false }
        : { trackLines: opts.trackLines ?? false }
      return root.parse(input, pos, ctx)
    },
  }
}

export function parse<T>(
  parser: Parser<T>,
  input: string,
  opts: GrammarOptions = {}
): ParseResult<T> {
  const ctx: ParseContext = opts.trivia !== undefined
    ? { trivia: opts.trivia, trackLines: opts.trackLines ?? false }
    : { trackLines: opts.trackLines ?? false }
  return parser.parse(input, 0, ctx)
}
