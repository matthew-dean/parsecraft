import type { Parser, ParseContext, ParseResult, ParserMeta, FirstSet } from '../types.ts'
import { union, intersects } from './first-set.ts'

type UnionParsers<T extends Parser<unknown>[]> = T[number] extends Parser<infer U> ? U : never

export function choice<T extends [Parser<unknown>, ...Parser<unknown>[]]>(
  ...parsers: T
): Parser<UnionParsers<T>> {
  // Check disjoint BEFORE union (union mutates via mergeRanges if we're not careful)
  const disjoint = areDisjoint(parsers.map(p => p._meta.firstSet))

  let combined: FirstSet = { kind: 'empty' }
  for (const p of parsers) combined = union(combined, p._meta.firstSet)

  const meta: ParserMeta = {
    firstSet: combined,
    canMatchNewline: parsers.some(p => p._meta.canMatchNewline),
    isTrivia: false,
    disjoint,
  }

  return {
    _tag: 'choice',
    _meta: meta,
    _def: { tag: 'choice', parsers: parsers as Parser<unknown>[], disjoint },
    parse(input: string, pos: number, ctx: ParseContext): ParseResult<UnionParsers<T>> {
      const expected: string[] = []

      if (disjoint && pos < input.length) {
        const code = input.codePointAt(pos)!
        for (const parser of parsers) {
          if (inFirstSet(code, parser._meta.firstSet)) {
            const result = parser.parse(input, pos, ctx)
            if (result.ok) return result as ParseResult<UnionParsers<T>>
            expected.push(...result.expected)
            return { ok: false, expected, span: { start: pos, end: pos } }
          }
        }
        // No branch first-set matched — collect all labels
        return {
          ok: false,
          expected: parsers.flatMap(p => {
            const r = p.parse(input, pos, ctx)
            return r.ok ? [] : r.expected
          }),
          span: { start: pos, end: pos },
        }
      }

      // Ordered fallback with backtracking
      for (const parser of parsers) {
        const result = parser.parse(input, pos, ctx)
        if (result.ok) return result as ParseResult<UnionParsers<T>>
        expected.push(...result.expected)
      }
      return { ok: false, expected, span: { start: pos, end: pos } }
    },
  }
}

function inFirstSet(code: number, fs: FirstSet): boolean {
  if (fs.kind === 'any') return true
  if (fs.kind === 'empty') return false
  for (const r of fs.ranges) {
    if (code >= r.lo && code <= r.hi) return true
  }
  return false
}

function areDisjoint(sets: FirstSet[]): boolean {
  if (sets.some(s => s.kind === 'any')) return false
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      if (intersects(sets[i]!, sets[j]!)) return false
    }
  }
  return true
}
