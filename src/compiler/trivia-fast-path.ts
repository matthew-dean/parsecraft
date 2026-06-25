import type { Combinator } from '../types.ts'
import { getCoreRegexDef } from '../combinators/choice.ts'

export type TriviaFastKind = 'wsComments' | 'wsOnly'

const BLOCK_COMMENT = String.raw`\/\*(?:[^*]|\*(?!\/))*\*\/`

/** Regex sources for ASCII whitespace runs (incl. regexp-tree reorderings). */
const WS_CLASS_SOURCES = new Set([
  String.raw`[ \t\n\r\f]+`,
  String.raw`[ \t\n]+`,
  String.raw`[ \t]+`,
  String.raw`[\t\n\f\r ]+`,
])

function unwrapTrivia(p: Combinator<unknown>): Combinator<unknown> {
  let cur = p
  while (cur._def.tag === 'trivia') cur = cur._def.parser
  return cur
}

function oneOrMoreInner(p: Combinator<unknown>): Combinator<unknown> | null {
  const d = p._def
  if (d.tag === 'oneOrMore') return d.parser
  if (d.tag === 'many' && d.min >= 1) return d.parser
  return null
}

function choiceArms(p: Combinator<unknown>): Combinator<unknown>[] | null {
  if (p._def.tag === 'choice') return p._def.parsers
  return null
}

function isWsClassSource(source: string): boolean {
  return WS_CLASS_SOURCES.has(source)
}

function isBlockCommentSource(source: string): boolean {
  return source === BLOCK_COMMENT
}

/**
 * Detect trivia shapes safe to lower to a hand-rolled scan loop in compiled output.
 * Matches CSS `rw` (`oneOrMore(choice(ws, blockComment))`) and ASCII ws-only grammars.
 * Single alternation regexes are excluded — one regex exec matches only one arm per call.
 */
export function analyzeTriviaFastPath(trivia: Combinator<unknown>): TriviaFastKind | null {
  const core = unwrapTrivia(trivia)

  const direct = getCoreRegexDef(core)?.source
  if (direct) {
    if (isWsClassSource(direct)) return 'wsOnly'
    return null
  }

  const inner = oneOrMoreInner(core)
  if (!inner) return null

  const innerSrc = getCoreRegexDef(inner)?.source
  if (innerSrc && isWsClassSource(innerSrc)) return 'wsOnly'

  const arms = choiceArms(inner)
  if (!arms || arms.length !== 2) return null

  let hasWs = false
  let hasComment = false
  for (const arm of arms) {
    const src = getCoreRegexDef(arm)?.source
    if (!src) return null
    if (isWsClassSource(src)) hasWs = true
    else if (isBlockCommentSource(src)) hasComment = true
    else return null
  }
  if (hasWs && hasComment) return 'wsComments'
  return null
}

const CAP_RECORD = [
  `  if (_cap && _e > _pos) {`,
  `    if (_ctx._triviaLog !== undefined) _ctx._triviaLog.push(_pos, _e)`,
  `    if (_ctx._cstTriviaLog !== undefined) _ctx._cstTriviaLog.push(_pos, _e, _ctx._cstRawChildren ? _ctx._cstRawChildren.length : 0)`,
  `  }`,
].join('\n')

const WS_ONLY_LOOP = [
  `  while (_e < input.length) {`,
  `    const c = input.charCodeAt(_e)`,
  `    if (c === 32 || c === 9 || c === 10 || c === 13 || c === 12) { _e++; continue }`,
  `    break`,
  `  }`,
].join('\n')

const WS_COMMENTS_LOOP = [
  `  while (_e < input.length) {`,
  `    const c = input.charCodeAt(_e)`,
  `    if (c === 32 || c === 9 || c === 10 || c === 13 || c === 12) { _e++; continue }`,
  `    if (c === 47 && input.charCodeAt(_e + 1) === 42) {`,
  `      let j = _e + 2`,
  `      while (j + 1 < input.length && !(input.charCodeAt(j) === 42 && input.charCodeAt(j + 1) === 47)) j++`,
  `      _e = j + 2 <= input.length ? j + 2 : input.length`,
  `      continue`,
  `    }`,
  `    break`,
  `  }`,
].join('\n')

/** Emit a specialized `_tfN` that skips trivia without regex / combinator dispatch. */
export function buildFastTriviaFnDecl(fnName: string, kind: TriviaFastKind): string {
  const loop = kind === 'wsComments' ? WS_COMMENTS_LOOP : WS_ONLY_LOOP
  return [
    `function ${fnName}(input, _pos, _ctx, _cap) {`,
    `  let _e = _pos`,
    loop,
    CAP_RECORD,
    `  return _e`,
    `}`,
  ].join('\n')
}
