import type { Combinator, ParseContext, ParseResult, ParserMeta } from '../types.ts'
import { literal } from './literal.ts'
import { sequence } from './sequence.ts'
import { transform } from './map.ts'
import { any } from './first-set.ts'

export type ScanToOptions = {
  /** Parsers that match "container" regions to skip over intact (balanced parens, strings, comments…) */
  skip?: Combinator<unknown>[]
  /**
   * If true, reaching EOF without finding the sentinel is a success — returns
   * everything consumed so far. Default false (fail at EOF).
   */
  orEOF?: boolean
}

/**
 * Consume input up to (but not including) the sentinel, skipping over any
 * "hole" patterns in order so their contents are never mistaken for the sentinel.
 *
 * Returns the consumed text as a string. The sentinel is NOT consumed.
 * Fails if the sentinel is never found (unless orEOF is true).
 *
 *   const selector = scanTo(literal('{'), {
 *     skip: [cssComment, stringLit, balanced('(', ')'), balanced('[', ']')],
 *   })
 */
export function scanTo(
  sentinel: Combinator<unknown>,
  { skip = [], orEOF = false }: ScanToOptions = {},
): Combinator<string> {
  const meta: ParserMeta = {
    firstSet: any(),
    canMatchNewline: true,
    isTrivia: false,
  }

  return {
    _tag: 'scanTo',
    _meta: meta,
    _def: { tag: 'scanTo', sentinel, skip, orEOF },
    parse(input: string, pos: number, ctx: ParseContext): ParseResult<string> {
      let cur = pos

      // Sentinel checks and skip scans must not emit CST children of their own —
      // scanTo represents the whole scanned span as one leaf. Probe them with a
      // collector-free context so their internal literal()/regex() don't push.
      const probeCtx: ParseContext = { trackLines: ctx.trackLines, state: ctx.state }

      // Record the scanned text as a CSTLeaf so buildNode-driven grammars can
      // see it in children/rawChildren (it would otherwise be lost — only the
      // returned value carries it). Skipped when no collector is active.
      const emit = (end: number) => {
        if (end > pos && (ctx._cstLeaves || ctx._cstRawChildren)) {
          const leaf = { _tag: 'leaf', value: input.slice(pos, end), span: { start: pos, end } }
          if (ctx._cstLeaves) (ctx._cstLeaves as unknown[]).push(leaf)
          if (ctx._cstRawChildren) (ctx._cstRawChildren as unknown[]).push(leaf)
        }
      }

      while (cur < input.length) {
        // Check sentinel — if it matches here, stop and return consumed text.
        const s = sentinel.parse(input, cur, probeCtx)
        if (s.ok) {
          emit(cur)
          return { ok: true, value: input.slice(pos, cur), span: { start: pos, end: cur } }
        }

        // Try each skipper in order; take first that advances.
        let advanced = false
        for (const skipper of skip) {
          const r = skipper.parse(input, cur, probeCtx)
          if (r.ok && r.span.end > cur) {
            cur = r.span.end
            advanced = true
            break
          }
        }

        // Nothing matched — consume one character and continue.
        if (!advanced) cur++
      }

      // Reached EOF without finding sentinel.
      if (orEOF) {
        emit(cur)
        return { ok: true, value: input.slice(pos, cur), span: { start: pos, end: cur } }
      }
      const sentDef = sentinel._def
      const expected = sentDef.tag === 'literal' ? [JSON.stringify(sentDef.value)] : ['sentinel']
      return { ok: false, expected, span: { start: pos, end: cur } }
    },
  }
}

/**
 * Match a balanced open/close pair, skipping over any holes inside.
 * Returns the full matched text including delimiters.
 *
 *   const parenGroup = balanced('(', ')', { skip: [comment, stringLit] })
 */
export function balanced(
  open: string,
  close: string,
  options: ScanToOptions = {},
): Combinator<string> {
  const inner = scanTo(literal(close), options)
  return transform(
    sequence(literal(open), inner, literal(close)),
    ([o, content, c]) => o + content + c,
  )
}
