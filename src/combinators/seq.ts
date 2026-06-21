import type { Parser, ParseContext, ParseResult, ParserMeta, ParseFail } from '../types.ts'
import { empty } from './first-set.ts'

type UnwrapParsers<T extends Parser<unknown>[]> = {
  [K in keyof T]: T[K] extends Parser<infer U> ? U : never
}

export function seq<T extends [Parser<unknown>, ...Parser<unknown>[]]>(
  ...parsers: T
): Parser<UnwrapParsers<T>> {
  const meta: ParserMeta = {
    firstSet: parsers[0]?._meta.firstSet ?? empty(),
    canMatchNewline: parsers.some(p => p._meta.canMatchNewline),
    isTrivia: false,
  }

  return {
    _tag: 'seq',
    _meta: meta,
    _def: { tag: 'seq', parsers: parsers as Parser<unknown>[] },
    parse(input: string, pos: number, ctx: ParseContext): ParseResult<UnwrapParsers<T>> {
      const values: unknown[] = []
      let cur = pos

      for (let i = 0; i < parsers.length; i++) {
        // skip trivia between terms (not before the first)
        if (ctx.trivia && i > 0) {
          const tr = ctx.trivia.parse(input, cur, ctx)
          if (tr.ok) cur = tr.span.end
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
