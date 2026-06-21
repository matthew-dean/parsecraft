import type { Parser, ParseContext, ParseResult } from '../types.ts'

export function map<T, U>(
  parser: Parser<T>,
  fn: (value: T, span: { start: number; end: number }) => U
): Parser<U> {
  return {
    _tag: 'map',
    _meta: parser._meta,
    _def: { tag: 'map', parser: parser as Parser<unknown>, fn: fn as (v: unknown, span: { start: number; end: number }) => unknown },
    parse(input: string, pos: number, ctx: ParseContext): ParseResult<U> {
      const result = parser.parse(input, pos, ctx)
      if (!result.ok) return result
      return { ...result, value: fn(result.value, result.span) }
    },
  }
}

export function skip<T, S>(main: Parser<T>, skipped: Parser<S>): Parser<T> {
  return {
    _tag: 'skip',
    _meta: main._meta,
    _def: { tag: 'skip', main: main as Parser<unknown>, skipped: skipped as Parser<unknown> },
    parse(input: string, pos: number, ctx: ParseContext): ParseResult<T> {
      const result = main.parse(input, pos, ctx)
      if (!result.ok) return result
      const s = skipped.parse(input, result.span.end, ctx)
      if (!s.ok) return result
      return { ...result, span: { start: result.span.start, end: s.span.end } }
    },
  }
}

export function trivia<T>(parser: Parser<T>): Parser<T> {
  return {
    _tag: parser._tag,
    _meta: { ...parser._meta, isTrivia: true },
    _def: { tag: 'trivia', parser: parser as Parser<unknown> },
    parse: parser.parse.bind(parser),
  }
}
