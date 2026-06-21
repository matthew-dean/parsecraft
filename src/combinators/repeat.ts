import type { Parser, ParseContext, ParseResult, ParserMeta } from '../types.ts'

export function many<T>(parser: Parser<T>): Parser<T[]> {
  const meta: ParserMeta = {
    firstSet: parser._meta.firstSet,
    canMatchNewline: parser._meta.canMatchNewline,
    isTrivia: false,
  }

  return {
    _tag: 'many',
    _meta: meta,
    _def: { tag: 'many', parser: parser as Parser<unknown>, min: 0 },
    parse(input: string, pos: number, ctx: ParseContext): ParseResult<T[]> {
      const values: T[] = []
      let cur = pos
      while (cur < input.length) {
        const result = parser.parse(input, cur, ctx)
        if (!result.ok) break
        if (result.span.end === cur) break
        values.push(result.value)
        cur = result.span.end
      }
      return { ok: true, value: values, span: { start: pos, end: cur } }
    },
  }
}

export function oneOrMore<T>(parser: Parser<T>): Parser<T[]> {
  const meta: ParserMeta = {
    firstSet: parser._meta.firstSet,
    canMatchNewline: parser._meta.canMatchNewline,
    isTrivia: false,
  }

  return {
    _tag: 'oneOrMore',
    _meta: meta,
    _def: { tag: 'oneOrMore', parser: parser as Parser<unknown>, min: 1 },
    parse(input: string, pos: number, ctx: ParseContext): ParseResult<T[]> {
      const first = parser.parse(input, pos, ctx)
      if (!first.ok) return first
      const values: T[] = [first.value]
      let cur = first.span.end
      while (cur < input.length) {
        const result = parser.parse(input, cur, ctx)
        if (!result.ok) break
        if (result.span.end === cur) break
        values.push(result.value)
        cur = result.span.end
      }
      return { ok: true, value: values, span: { start: pos, end: cur } }
    },
  }
}

export function optional<T>(parser: Parser<T>): Parser<T | null> {
  const meta: ParserMeta = {
    firstSet: parser._meta.firstSet,
    canMatchNewline: parser._meta.canMatchNewline,
    isTrivia: false,
  }

  return {
    _tag: 'optional',
    _meta: meta,
    _def: { tag: 'optional', parser: parser as Parser<unknown> },
    parse(input: string, pos: number, ctx: ParseContext): ParseResult<T | null> {
      const result = parser.parse(input, pos, ctx)
      if (result.ok) return result as ParseResult<T>
      return { ok: true, value: null, span: { start: pos, end: pos } }
    },
  }
}

export function sepBy<T, S>(parser: Parser<T>, separator: Parser<S>): Parser<T[]> {
  const meta: ParserMeta = {
    firstSet: parser._meta.firstSet,
    canMatchNewline: parser._meta.canMatchNewline || separator._meta.canMatchNewline,
    isTrivia: false,
  }

  return {
    _tag: 'sepBy',
    _meta: meta,
    _def: { tag: 'sepBy', parser: parser as Parser<unknown>, separator: separator as Parser<unknown> },
    parse(input: string, pos: number, ctx: ParseContext): ParseResult<T[]> {
      const first = parser.parse(input, pos, ctx)
      if (!first.ok) return { ok: true, value: [], span: { start: pos, end: pos } }
      const values: T[] = [first.value]
      let cur = first.span.end
      while (cur < input.length) {
        const sep = separator.parse(input, cur, ctx)
        if (!sep.ok) break
        const next = parser.parse(input, sep.span.end, ctx)
        if (!next.ok) break
        values.push(next.value)
        cur = next.span.end
      }
      return { ok: true, value: values, span: { start: pos, end: cur } }
    },
  }
}
