import type { Combinator } from '../types.ts'
import { getCoreRegexDef } from '../combinators/choice.ts'
import type { LabeledTriviaSpec } from '../cst/trivia-kinds.ts'
import { analyzeLabeledTrivia } from '../cst/trivia-kinds.ts'
import { type ScanShape, parseScanShape, scanBranch } from './scannable-run.ts'

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

/** The scannable shape of one arm (a regex), or null if it isn't scannable. */
function armShape(arm: Combinator<unknown>): ScanShape | null {
  const src = getCoreRegexDef(arm)?.source
  return src ? parseScanShape(src) : null
}

/**
 * A trivia parser that lowers to a hand-rolled char-scan loop: `oneOrMore(choice(
 * …))` (or `many`, min≥1) where EVERY arm is a scannable shape (a `[X]+` run, a
 * `<lit>[^X]*` open-until-terminator, or a `<open>(?:…)*<close>` delimited token
 * — see scannable-run.ts). Returns the per-arm shapes, or a single-element list
 * for a bare scannable regex, or null (→ caller falls back to the regex/generic
 * trivia path). A single alternation regex is NOT scannable (one exec matches one
 * arm per call, defeating the loop).
 */
export function analyzeTriviaFastPath(trivia: Combinator<unknown>): ScanShape[] | null {
  const core = unwrapTrivia(trivia)

  const directSrc = getCoreRegexDef(core)?.source
  if (directSrc) {
    const shape = parseScanShape(directSrc)
    return shape && shape.kind === 'chars' ? [shape] : null
  }

  const inner = oneOrMoreInner(core)
  if (!inner) return null

  const innerShape = armShape(inner)
  if (innerShape) return innerShape.kind === 'chars' ? [innerShape] : null

  const arms = choiceArms(inner)
  if (!arms || arms.length < 2) return null

  const shapes: ScanShape[] = []
  for (const arm of arms) {
    const shape = armShape(arm)
    if (!shape) return null
    shapes.push(shape)
  }
  return shapes
}

/** True for the ws-run + block-delimited 2-shape set the labeled path can kind-tag. */
export function isWsBlockShapeSet(shapes: ScanShape[]): boolean {
  return (
    shapes.length === 2 &&
    shapes.some(s => s.kind === 'chars') &&
    shapes.some(s => s.kind === 'delimited')
  )
}

const CAP_RECORD = [
  `  if (_cap && _e > _pos) {`,
  `    if (_ctx._triviaLog !== undefined) _ctx._triviaLog.push(_pos, _e)`,
  `    if (_ctx._cstTriviaLog !== undefined) _ctx._cstTriviaLog.push(_pos, _e, _ctx._cstRawChildren ? _ctx._cstRawChildren.length : 0)`,
  `  }`,
].join('\n')

/** One char-scan loop carrying a branch per scannable shape, dispatched on `c`. */
function composeFastLoop(shapes: ScanShape[]): string {
  return [
    `  while (_e < input.length) {`,
    `    const c = input.charCodeAt(_e)`,
    ...shapes.map(scanBranch),
    `    break`,
    `  }`,
  ].join('\n')
}

const CAP_CHUNK = (wsKind: number, commentKind: number) => [
  `    if (c === 32 || c === 9 || c === 10 || c === 13 || c === 12) {`,
  `      const _cs = _e`,
  `      _e++`,
  `      while (_e < input.length) {`,
  `        const c2 = input.charCodeAt(_e)`,
  `        if (c2 === 32 || c2 === 9 || c2 === 10 || c2 === 13 || c2 === 12) _e++`,
  `        else break`,
  `      }`,
  `      if (_cap) {`,
  `        if (_ctx._triviaLog !== undefined) _ctx._triviaLog.push(_cs, _e, ${wsKind})`,
  `        if (_ctx._cstTriviaLog !== undefined) _ctx._cstTriviaLog.push(_cs, _e, _ctx._cstRawChildren ? _ctx._cstRawChildren.length : 0, ${wsKind})`,
  `      }`,
  `      continue`,
  `    }`,
  `    if (c === 47 && input.charCodeAt(_e + 1) === 42) {`,
  `      const _cs = _e`,
  `      let j = _e + 2`,
  `      while (j + 1 < input.length && !(input.charCodeAt(j) === 42 && input.charCodeAt(j + 1) === 47)) j++`,
  `      _e = j + 2 <= input.length ? j + 2 : input.length`,
  `      if (_cap) {`,
  `        if (_ctx._triviaLog !== undefined) _ctx._triviaLog.push(_cs, _e, ${commentKind})`,
  `        if (_ctx._cstTriviaLog !== undefined) _ctx._cstTriviaLog.push(_cs, _e, _ctx._cstRawChildren ? _ctx._cstRawChildren.length : 0, ${commentKind})`,
  `      }`,
  `      continue`,
  `    }`,
].join('\n')

const WS_COMMENTS_LOOP_LABELED = (wsKind: number, commentKind: number) => [
  `  while (_e < input.length) {`,
  `    const c = input.charCodeAt(_e)`,
  CAP_CHUNK(wsKind, commentKind),
  `    break`,
  `  }`,
].join('\n')

/** Emit a specialized `_tfN` that skips trivia without regex / combinator dispatch. */
export function buildFastTriviaFnDecl(
  fnName: string,
  shapes: ScanShape[],
  kindIndices?: { ws: number; comment: number },
): string {
  // Labeled path: only the ws-run + block-comment shape emits per-chunk kind
  // indices today (the labeled kind analysis is 2-arm; the caller passes
  // kindIndices only for that shape — see ensureTriviaFn). Every other shape set
  // uses the non-labeled composed loop + whole-run CAP_RECORD.
  const useLabeled = !!kindIndices && isWsBlockShapeSet(shapes)
  const loop = useLabeled
    ? WS_COMMENTS_LOOP_LABELED(kindIndices!.ws, kindIndices!.comment)
    : composeFastLoop(shapes)
  const cap = useLabeled ? '' : CAP_RECORD
  const lines = [
    `function ${fnName}(input, _pos, _ctx, _cap) {`,
    `  let _e = _pos`,
    loop,
  ]
  if (cap) lines.push(cap)
  lines.push(`  return _e`, `}`)
  return lines.join('\n')
}

function regexArmIndex(spec: LabeledTriviaSpec, isComment: boolean): number | null {
  for (const arm of spec.arms) {
    const src = getCoreRegexDef(arm.parser)?.source
    if (!src) return null
    const comment = src.includes('\\*') || src.startsWith('\\/\\/')
    if (comment === isComment) return arm.kindIndex
  }
  return null
}

/** Labeled trivia with regex arms — per-chunk kind capture in compiled output. */
export function buildLabeledRegexTriviaFnDecl(
  fnName: string,
  spec: LabeledTriviaSpec,
  reNames: string[],
): string {
  const tryArms = spec.arms.map((arm, i) => {
    const re = reNames[i]!
    const k = arm.kindIndex
    return [
      `    ${re}.lastIndex = _e`,
      `    const _m${i} = ${re}.exec(input)`,
      `    if (_m${i} && _m${i}.index === _e) {`,
      `      const _ce = _e + _m${i}[0].length`,
      `      if (_cap) {`,
      `        if (_ctx._triviaLog !== undefined) _ctx._triviaLog.push(_e, _ce, ${k})`,
      `        if (_ctx._cstTriviaLog !== undefined) _ctx._cstTriviaLog.push(_e, _ce, _ctx._cstRawChildren ? _ctx._cstRawChildren.length : 0, ${k})`,
      `      }`,
      `      _e = _ce`,
      `      _matched = true`,
      `      continue`,
      `    }`,
    ].join('\n')
  }).join('\n')

  return [
    `function ${fnName}(input, _pos, _ctx, _cap) {`,
    `  let _e = _pos`,
    `  while (_e < input.length) {`,
    `    let _matched = false`,
    tryArms,
    `    if (!_matched) break`,
    `  }`,
    `  return _e`,
    `}`,
  ].join('\n')
}

export function labeledTriviaKindIndices(trivia: Combinator<unknown>): { ws: number; comment: number } | null {
  const spec = analyzeLabeledTrivia(trivia)
  if (!spec || spec.arms.length !== 2) return null
  const ws = regexArmIndex(spec, false)
  const comment = regexArmIndex(spec, true)
  if (ws === null || comment === null) return null
  return { ws, comment }
}

export function labeledTriviaRegexArms(trivia: Combinator<unknown>): LabeledTriviaSpec | null {
  const spec = analyzeLabeledTrivia(trivia)
  if (!spec) return null
  for (const arm of spec.arms) {
    if (!getCoreRegexDef(arm.parser)) return null
  }
  return spec
}

/** Labeled trivia via per-arm runtime parsers (non-regex or mixed arms). */
export function buildLabeledRuntimeTriviaFnDecl(
  fnName: string,
  spec: LabeledTriviaSpec,
  rpStartIndex: number,
): string {
  const tryArms = spec.arms.map((arm, i) => {
    const k = arm.kindIndex
    const ri = rpStartIndex + i
    return [
      `    const _r${i} = _rp[${ri}].parse(input, _e, _ctx)`,
      `    if (_r${i}.ok && _r${i}.span.end > _e) {`,
      `      const _ce = _r${i}.span.end`,
      `      if (_cap) {`,
      `        if (_ctx._triviaLog !== undefined) _ctx._triviaLog.push(_e, _ce, ${k})`,
      `        if (_ctx._cstTriviaLog !== undefined) _ctx._cstTriviaLog.push(_e, _ce, _ctx._cstRawChildren ? _ctx._cstRawChildren.length : 0, ${k})`,
      `      }`,
      `      _e = _ce`,
      `      _matched = true`,
      `      continue`,
      `    }`,
    ].join('\n')
  }).join('\n')

  return [
    `function ${fnName}(input, _pos, _ctx, _cap) {`,
    `  let _e = _pos`,
    `  while (_e < input.length) {`,
    `    let _matched = false`,
    tryArms,
    `    if (!_matched) break`,
    `  }`,
    `  return _e`,
    `}`,
  ].join('\n')
}
