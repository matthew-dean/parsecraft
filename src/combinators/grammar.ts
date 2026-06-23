import type { Combinator, ParseContext, ParseResult } from '../types.ts'
import { buildLineIndex, annotateSpan } from '../compiler/line-index.ts'

export type ParseOptions = {
  trackLines?: boolean
  /**
   * Enable error recovery. When true, recover() nodes collect their ParseErrors
   * into a side-channel array rather than (only) embedding them in the value tree.
   * The returned ParseOk will have an `errors` field listing all recovered errors.
   * Top-level parse failures (where no recover() node caught the error) still
   * return ParseFail as usual.
   */
  recover?: boolean
}

export type ParserOptions = ParseOptions & {
  trivia?: Combinator<unknown>
}

export interface ParsemanParser<T> extends Combinator<T> {
  parse(input: string): ParseResult<T>
  parse(input: string, pos: number, ctx: ParseContext): ParseResult<T>
}

export function parser<T>(opts: ParserOptions, root: Combinator<T>): ParsemanParser<T> {
  return {
    _tag: 'grammar',
    _meta: root._meta,
    _def: {
      tag: 'grammar',
      parser: root as Combinator<unknown>,
      triviaParser: opts.trivia,
      trackLines: opts.trackLines ?? false,
    },
    parse(input: string, pos?: number, _ctx?: ParseContext): ParseResult<T> {
      const trackLines = opts.trackLines ?? false
      const ctx: ParseContext = opts.trivia !== undefined
        ? { trivia: opts.trivia, trackLines }
        : { trackLines }
      const result = root.parse(input, pos ?? 0, ctx)
      if (trackLines) {
        const idx = buildLineIndex(input)
        return { ...result, span: annotateSpan(result.span, idx) }
      }
      return result
    },
  } as ParsemanParser<T>
}

export function parse<T>(
  combinator: Combinator<T>,
  input: string,
  opts: ParseOptions = {}
): ParseResult<T> {
  const trackLines = opts.trackLines ?? false
  const _errors = opts.recover ? [] : undefined
  const ctx: ParseContext = {
    trackLines,
    ...(_errors !== undefined ? { _errors } : {}),
  }
  const result = combinator.parse(input, 0, ctx)
  if (!result.ok) return result
  const withErrors = _errors !== undefined ? { ...result, errors: _errors } : result
  if (trackLines) {
    const idx = buildLineIndex(input)
    return { ...withErrors, span: annotateSpan(withErrors.span, idx) }
  }
  return withErrors
}
