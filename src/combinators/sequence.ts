import type { Combinator, ParseContext, ParseResult, ParserMeta, ParseFail } from '../types.ts'
import { empty } from './first-set.ts'
import { scanTrivia } from './trivia-skip.ts'

type UnwrapParsers<T extends Combinator<unknown>[]> = {
  [K in keyof T]: T[K] extends Combinator<infer U> ? U : never
}

export function sequence<T extends [Combinator<unknown>, ...Combinator<unknown>[]]>(
  ...parsers: T
): Combinator<UnwrapParsers<T>> {
  const meta: ParserMeta = {
    firstSet: parsers[0]?._meta.firstSet ?? empty(),
    canMatchNewline: parsers.some(p => p._meta.canMatchNewline),
    isTrivia: false,
  }

  return {
    _tag: 'sequence',
    _meta: meta,
    _def: { tag: 'sequence', parsers: parsers as Combinator<unknown>[] },
    parse(input: string, pos: number, ctx: ParseContext): ParseResult<UnwrapParsers<T>> {
      const values: unknown[] = []
      let cur = pos

      for (let i = 0; i < parsers.length; i++) {
        if (ctx.trivia && i > 0) {
          // Skip trivia between terms, but only *consume/record* it if this term
          // actually matches content past the trivia. A term that matches empty
          // (optional/many/lookahead) leaves the trivia for the enclosing rule,
          // so trailing trivia isn't swept into this sequence's span (which would
          // be lost if the sequence later collapses to a primitive).
          //
          // Commit the trivia *before* parsing the term so rawChildren order
          // stays [term, trivia, term]; roll it back if the term matched empty.
          const scan = scanTrivia(input, cur, ctx)
          const raw = ctx._cstRawChildren as unknown[] | undefined
          const mark = raw ? raw.length : 0
          scan.commit()
          const result = parsers[i]!.parse(input, scan.end, ctx)
          if (!result.ok) return result as ParseFail
          if (result.span.end > scan.end) {
            cur = result.span.end
          } else if (raw) {
            raw.length = mark
          }
          values.push(result.value)
          continue
        }

        const result = parsers[i]!.parse(input, cur, ctx)
        if (!result.ok) return result as ParseFail
        values.push(result.value)
        cur = result.span.end
      }

      return {
        ok: true,
        value: values as UnwrapParsers<T>,
        span: { start: pos, end: cur },
      }
    },
  }
}
