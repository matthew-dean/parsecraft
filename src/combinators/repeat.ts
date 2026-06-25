import type { Combinator, ParseContext, ParseResult, ParserMeta } from '../types.ts'
import { advanceTrivia, needsDeferredTriviaCommit, rollbackTrivia, saveTriviaMark, scanTrivia } from './trivia-skip.ts'

/**
 * Parse one repetition item at `cur`, first skipping (and, in capture mode,
 * recording) any leading trivia — so a repeating combinator consumes the trivia
 * between items uniformly, the way advancing the index always should. Trivia is
 * committed *before* the item so rawChildren order stays [item, trivia, item];
 * if the item then fails or makes no progress the trivia is rolled back and the
 * loop stops (the trivia is trailing and belongs to the enclosing context).
 *
 * Returns the item value + end position, the underlying failure (so oneOrMore
 * can propagate a first-item failure), or 'stop'.
 */
function repItem<T>(
  combinator: Combinator<T>,
  input: string,
  cur: number,
  ctx: ParseContext
): { value: T; end: number } | { fail: ParseResult<T> } | 'stop' {
  const mark = saveTriviaMark(ctx)
  let pos = cur
  if (ctx.trivia) {
    if (needsDeferredTriviaCommit(ctx)) {
      const scan = scanTrivia(input, cur, ctx)
      scan.commit()
      pos = scan.end
    } else {
      pos = advanceTrivia(input, cur, ctx)
    }
  }
  // Nothing but trivia left: don't speculatively parse an item at EOF (it would
  // fail and could trigger an item's recover()/error side-effects). The trivia
  // is trailing — roll it back for the enclosing context and stop.
  if (pos >= input.length) {
    rollbackTrivia(ctx, mark)
    return 'stop'
  }
  const result = combinator.parse(input, pos, ctx)
  if (!result.ok) {
    rollbackTrivia(ctx, mark)
    return { fail: result }
  }
  if (result.span.end === pos) {
    rollbackTrivia(ctx, mark)
    return 'stop'
  }
  return { value: result.value, end: result.span.end }
}

export function many<T>(combinator: Combinator<T>): Combinator<T[]> {
  const meta: ParserMeta = {
    firstSet: combinator._meta.firstSet,
    canMatchNewline: combinator._meta.canMatchNewline,
    isTrivia: false,
  }

  return {
    _tag: 'many',
    _meta: meta,
    _def: { tag: 'many', parser: combinator as Combinator<unknown>, min: 0 },
    parse(input: string, pos: number, ctx: ParseContext): ParseResult<T[]> {
      const values: T[] = []
      let cur = pos
      while (cur < input.length) {
        const item = repItem(combinator, input, cur, ctx)
        if (item === 'stop' || 'fail' in item) break
        values.push(item.value)
        cur = item.end
      }
      return { ok: true, value: values, span: { start: pos, end: cur } }
    },
  }
}

export function oneOrMore<T>(combinator: Combinator<T>): Combinator<T[]> {
  const meta: ParserMeta = {
    firstSet: combinator._meta.firstSet,
    canMatchNewline: combinator._meta.canMatchNewline,
    isTrivia: false,
  }

  return {
    _tag: 'oneOrMore',
    _meta: meta,
    _def: { tag: 'oneOrMore', parser: combinator as Combinator<unknown>, min: 1 },
    parse(input: string, pos: number, ctx: ParseContext): ParseResult<T[]> {
      // First item is mandatory (parsed at pos directly — leading trivia is the
      // enclosing context's responsibility); subsequent items skip leading trivia.
      const first = combinator.parse(input, pos, ctx)
      if (!first.ok) return first
      const values: T[] = [first.value]
      let cur = first.span.end
      while (cur < input.length) {
        const item = repItem(combinator, input, cur, ctx)
        if (item === 'stop' || 'fail' in item) break
        values.push(item.value)
        cur = item.end
      }
      return { ok: true, value: values, span: { start: pos, end: cur } }
    },
  }
}

export function optional<T>(combinator: Combinator<T>): Combinator<T | null> {
  const meta: ParserMeta = {
    firstSet: combinator._meta.firstSet,
    canMatchNewline: combinator._meta.canMatchNewline,
    isTrivia: false,
  }

  return {
    _tag: 'optional',
    _meta: meta,
    _def: { tag: 'optional', parser: combinator as Combinator<unknown> },
    parse(input: string, pos: number, ctx: ParseContext): ParseResult<T | null> {
      const result = combinator.parse(input, pos, ctx)
      if (result.ok) return result as ParseResult<T>
      return { ok: true, value: null, span: { start: pos, end: pos } }
    },
  }
}

export function sepBy<T, S>(combinator: Combinator<T>, separator: Combinator<S>): Combinator<T[]> {
  const meta: ParserMeta = {
    firstSet: combinator._meta.firstSet,
    canMatchNewline: combinator._meta.canMatchNewline || separator._meta.canMatchNewline,
    isTrivia: false,
  }

  return {
    _tag: 'sepBy',
    _meta: meta,
    _def: { tag: 'sepBy', parser: combinator as Combinator<unknown>, separator: separator as Combinator<unknown> },
    parse(input: string, pos: number, ctx: ParseContext): ParseResult<T[]> {
      const first = combinator.parse(input, pos, ctx)
      if (!first.ok) return { ok: true, value: [], span: { start: pos, end: pos } }
      const values: T[] = [first.value]
      let cur = first.span.end
      while (cur < input.length) {
        let mark = saveTriviaMark(ctx)
        let sepPos = cur
        if (ctx.trivia) {
          if (needsDeferredTriviaCommit(ctx)) {
            const scan = scanTrivia(input, cur, ctx)
            scan.commit()
            sepPos = scan.end
          } else {
            sepPos = advanceTrivia(input, cur, ctx)
          }
        }
        const sep = separator.parse(input, sepPos, ctx)
        if (!sep.ok) {
          rollbackTrivia(ctx, mark)
          break
        }
        mark = saveTriviaMark(ctx)
        let nextPos = sep.span.end
        if (ctx.trivia) {
          if (needsDeferredTriviaCommit(ctx)) {
            const scan = scanTrivia(input, sep.span.end, ctx)
            scan.commit()
            nextPos = scan.end
          } else {
            nextPos = advanceTrivia(input, sep.span.end, ctx)
          }
        }
        const next = combinator.parse(input, nextPos, ctx)
        if (!next.ok) {
          rollbackTrivia(ctx, mark)
          break
        }
        values.push(next.value)
        cur = next.span.end
      }
      return { ok: true, value: values, span: { start: pos, end: cur } }
    },
  }
}
