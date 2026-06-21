/**
 * Compile a Parser<T> definition tree into an optimized JavaScript function.
 *
 * Design: every sub-emitter uses early-return on failure. Fallible contexts
 * (many loops, non-disjoint choice arms) wrap inner code in IIFEs so
 * early-return keeps working uniformly throughout.
 */
import type { Parser, ParserDef, FirstSet, ParseResult, ParseContext } from '../types.ts'

// ---------------------------------------------------------------------------
// Codegen context
// ---------------------------------------------------------------------------
type Ctx = {
  vars: number
  indent: number
  /** Regex declarations hoisted to module scope */
  regexDecls: string[]
  /** Map functions that need to be captured at compile time */
  mapFns: Array<(v: unknown, span: { start: number; end: number }) => unknown>
  /** Runtime parser fallbacks (for unknown/_def-less parsers) */
  runtimeParsers: Array<Parser<unknown>>
  /** Whether any case-insensitive lit was emitted (needs collator) */
  needsCollator: boolean
}

function v(ctx: Ctx, prefix = '_v'): string { return `${prefix}${ctx.vars++}` }
function ind(ctx: Ctx): string { return '  '.repeat(ctx.indent) }

// ---------------------------------------------------------------------------
// The result every emitter returns.
// After the emitted stmts, `valueVar` holds the parsed value and `endVar`
// holds the new position. On failure the emitter already emitted an early
// `return failResult`.
// ---------------------------------------------------------------------------
type ER = { stmts: string[]; valueVar: string; endVar: string }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function failStmt(ctx: Ctx, expected: string, posExpr: string): string {
  return `${ind(ctx)}return { ok: false, expected: [${expected}], span: { start: ${posExpr}, end: ${posExpr} } }`
}

function firstSetCond(codeVar: string, fs: FirstSet): string {
  if (fs.kind === 'any') return 'true'
  if (fs.kind === 'empty') return 'false'
  return fs.ranges.map(r =>
    r.lo === r.hi
      ? `${codeVar} === ${r.lo}`
      : `(${codeVar} >= ${r.lo} && ${codeVar} <= ${r.hi})`
  ).join(' || ')
}

/** Wrap stmts + success return in an IIFE. Returns the IIFE expression string. */
function asIIFE(stmts: string[], valueVar: string, endVar: string, startPos: string, indent: string): string {
  return [
    `(() => {`,
    ...stmts,
    `${indent}  return { ok: true, value: ${valueVar}, span: { start: ${startPos}, end: ${endVar} } }`,
    `${indent}})()`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Per-combinator emitters
// ---------------------------------------------------------------------------

function emitLit(def: Extract<ParserDef, { tag: 'lit' }>, ctx: Ctx, pos: string): ER {
  const { value, caseInsensitive } = def
  const len = value.length
  const vv = v(ctx)
  const expectedStr = JSON.stringify(JSON.stringify(value))
  const stmts: string[] = []

  if (caseInsensitive) {
    ctx.needsCollator = true
    stmts.push(
      `${ind(ctx)}if (${pos} + ${len} > input.length) ${failStmt({ ...ctx, indent: 0 }, expectedStr, pos).trim()}`,
      `${ind(ctx)}const ${vv}_s = input.slice(${pos}, ${pos} + ${len})`,
      `${ind(ctx)}if (_collator.compare(${vv}_s, ${JSON.stringify(value)}) !== 0) ${failStmt({ ...ctx, indent: 0 }, expectedStr, pos).trim()}`,
      `${ind(ctx)}const ${vv} = ${vv}_s`,
    )
  } else if (len === 0) {
    stmts.push(`${ind(ctx)}const ${vv} = ''`)
  } else if (len === 1) {
    const code = value.codePointAt(0)!
    stmts.push(
      `${ind(ctx)}if (${pos} >= input.length || input.charCodeAt(${pos}) !== ${code}) ${failStmt({ ...ctx, indent: 0 }, expectedStr, pos).trim()}`,
      `${ind(ctx)}const ${vv} = ${JSON.stringify(value)}`,
    )
  } else if (len <= 4) {
    const checks = Array.from({ length: len }, (_, i) =>
      `input.charCodeAt(${pos}${i > 0 ? ` + ${i}` : ''}) !== ${value.codePointAt(i)!}`
    ).join(' || ')
    stmts.push(
      `${ind(ctx)}if (${pos} + ${len} > input.length || ${checks}) ${failStmt({ ...ctx, indent: 0 }, expectedStr, pos).trim()}`,
      `${ind(ctx)}const ${vv} = ${JSON.stringify(value)}`,
    )
  } else {
    const firstCode = value.codePointAt(0)!
    stmts.push(
      `${ind(ctx)}if (${pos} + ${len} > input.length || input.charCodeAt(${pos}) !== ${firstCode} || input.slice(${pos}, ${pos} + ${len}) !== ${JSON.stringify(value)}) ${failStmt({ ...ctx, indent: 0 }, expectedStr, pos).trim()}`,
      `${ind(ctx)}const ${vv} = ${JSON.stringify(value)}`,
    )
  }

  return { stmts, valueVar: vv, endVar: len === 0 ? pos : `${pos} + ${len}` }
}

function emitRegex(def: Extract<ParserDef, { tag: 'regex' }>, ctx: Ctx, pos: string): ER {
  const flags = 'y' + def.flags.replace(/[gy]/g, '')
  const rName = `_re${ctx.regexDecls.length}`
  ctx.regexDecls.push(`const ${rName} = /${def.optimizedSource}/${flags}`)

  const mv = v(ctx, '_m')
  const vv = v(ctx)
  const expectedStr = JSON.stringify(`/${def.source}/`)
  const stmts = [
    `${ind(ctx)}${rName}.lastIndex = ${pos}`,
    `${ind(ctx)}const ${mv} = ${rName}.exec(input)`,
    `${ind(ctx)}if (${mv} === null) ${failStmt({ ...ctx, indent: 0 }, expectedStr, pos).trim()}`,
    `${ind(ctx)}const ${vv} = ${mv}[0]`,
  ]
  return { stmts, valueVar: vv, endVar: `${pos} + ${vv}.length` }
}

function emitSeq(def: Extract<ParserDef, { tag: 'seq' }>, ctx: Ctx, pos: string): ER {
  const startV = v(ctx, '_start')
  const curV = v(ctx, '_cur')
  const stmts: string[] = [
    `${ind(ctx)}const ${startV} = ${pos}`,
    `${ind(ctx)}let ${curV} = ${pos}`,
  ]
  const valueVars: string[] = []

  for (let i = 0; i < def.parsers.length; i++) {
    const r = emit(def.parsers[i]!, ctx, curV)
    stmts.push(...r.stmts, `${ind(ctx)}${curV} = ${r.endVar}`)
    valueVars.push(r.valueVar)
  }

  const arrV = v(ctx, '_arr')
  stmts.push(`${ind(ctx)}const ${arrV} = [${valueVars.join(', ')}]`)
  return { stmts, valueVar: arrV, endVar: curV }
}

function emitChoice(def: Extract<ParserDef, { tag: 'choice' }>, ctx: Ctx, pos: string): ER {
  const allExpected = JSON.stringify(
    def.parsers.map(p => {
      const d = p._def
      if (d.tag === 'lit') return JSON.stringify(d.value)
      if (d.tag === 'regex') return `/${d.source}/`
      return p._tag
    })
  )

  if (def.disjoint) {
    const codeV = v(ctx, '_code')
    const valV = v(ctx, '_chv')
    const endV = v(ctx, '_che')
    const stmts: string[] = [
      `${ind(ctx)}const ${codeV} = ${pos} < input.length ? (input.codePointAt(${pos}) ?? -1) : -1`,
      `${ind(ctx)}let ${valV}, ${endV} = ${pos}`,
    ]

    let first = true
    for (const p of def.parsers) {
      const cond = firstSetCond(codeV, p._meta.firstSet)
      const kw = first ? 'if' : 'else if'
      first = false
      stmts.push(`${ind(ctx)}${kw} (${cond}) {`)
      ctx.indent++
      const r = emit(p, ctx, pos)
      stmts.push(...r.stmts)
      stmts.push(`${ind(ctx)}${valV} = ${r.valueVar}; ${endV} = ${r.endVar}`)
      ctx.indent--
      stmts.push(`${ind(ctx)}}`)
    }
    stmts.push(
      `${ind(ctx)}else return { ok: false, expected: ${allExpected}, span: { start: ${pos}, end: ${pos} } }`,
    )
    return { stmts, valueVar: valV, endVar: endV }
  }

  // Non-disjoint: try each arm in an IIFE, use first that succeeds
  const resV = v(ctx, '_cr')
  const stmts: string[] = [`${ind(ctx)}let ${resV}`]

  for (const p of def.parsers) {
    const savedIndent = ctx.indent
    ctx.indent = 0
    const r = emit(p, ctx, pos)
    ctx.indent = savedIndent
    const iife = asIIFE(r.stmts, r.valueVar, r.endVar, pos, ind(ctx))
    stmts.push(
      `${ind(ctx)}if (!${resV}?.ok) { try { ${resV} = ${iife} } catch {} }`,
    )
  }
  stmts.push(
    `${ind(ctx)}if (!${resV}?.ok) return { ok: false, expected: ${allExpected}, span: { start: ${pos}, end: ${pos} } }`,
  )
  return { stmts, valueVar: `${resV}.value`, endVar: `${resV}.span.end` }
}

function emitMany(def: Extract<ParserDef, { tag: 'many' | 'many1' }>, ctx: Ctx, pos: string): ER {
  const arrV = v(ctx, '_arr')
  const curV = v(ctx, '_cur')
  const stmts: string[] = [
    `${ind(ctx)}const ${arrV} = []`,
    `${ind(ctx)}let ${curV} = ${pos}`,
  ]

  const emitInnerIIFE = (): string => {
    const savedIndent = ctx.indent
    ctx.indent = 0
    const r = emit(def.parser, ctx, curV)
    ctx.indent = savedIndent
    return asIIFE(r.stmts, r.valueVar, r.endVar, curV, ind(ctx) + '  ')
  }

  if (def.min === 1) {
    // Inline first mandatory match with early-return on failure
    const firstR = emit(def.parser, ctx, curV)
    stmts.push(...firstR.stmts)
    stmts.push(
      `${ind(ctx)}${arrV}.push(${firstR.valueVar})`,
      `${ind(ctx)}${curV} = ${firstR.endVar}`,
    )
  }

  stmts.push(`${ind(ctx)}while (${curV} < input.length) {`)
  ctx.indent++
  stmts.push(
    `${ind(ctx)}const _iter = (() => { try { return ${emitInnerIIFE()} } catch { return null } })()`,
    `${ind(ctx)}if (!_iter?.ok || _iter.span.end === ${curV}) break`,
    `${ind(ctx)}${arrV}.push(_iter.value)`,
    `${ind(ctx)}${curV} = _iter.span.end`,
  )
  ctx.indent--
  stmts.push(`${ind(ctx)}}`)

  return { stmts, valueVar: arrV, endVar: curV }
}

function emitOptional(def: Extract<ParserDef, { tag: 'optional' }>, ctx: Ctx, pos: string): ER {
  const valV = v(ctx, '_opt')
  const endV = v(ctx, '_opte')

  const savedIndent = ctx.indent
  ctx.indent = 0
  const r = emit(def.parser, ctx, pos)
  ctx.indent = savedIndent

  const iife = asIIFE(r.stmts, r.valueVar, r.endVar, pos, ind(ctx))
  const resV = v(ctx, '_optr')
  const stmts = [
    `${ind(ctx)}const ${resV} = (() => { try { return ${iife} } catch { return null } })()`,
    `${ind(ctx)}const ${valV} = ${resV}?.ok ? ${resV}.value : null`,
    `${ind(ctx)}const ${endV} = ${resV}?.ok ? ${resV}.span.end : ${pos}`,
  ]
  return { stmts, valueVar: valV, endVar: endV }
}

function emitSepBy(_p: Parser<unknown>, def: Extract<ParserDef, { tag: 'sepBy' }>, ctx: Ctx, pos: string): ER {
  const arrV = v(ctx, '_arr')
  const curV = v(ctx, '_cur')

  // IIFE helpers — inner emit at indent 0 to avoid nested indentation noise
  const iife = (inner: Parser<unknown>, posExpr: string): string => {
    const saved = ctx.indent
    ctx.indent = 0
    const r = emit(inner, ctx, posExpr)
    ctx.indent = saved
    return asIIFE(r.stmts, r.valueVar, r.endVar, posExpr, ind(ctx))
  }

  const firstR_saved = ctx.indent
  ctx.indent = 0
  const firstR = emit(def.parser, ctx, pos)
  ctx.indent = firstR_saved

  const firstV = v(ctx, '_sb0')
  const sepV = v(ctx, '_sbs')
  const nextV = v(ctx, '_sbn')

  const stmts: string[] = [
    `${ind(ctx)}const ${arrV} = []`,
    `${ind(ctx)}let ${curV} = ${pos}`,
    `${ind(ctx)}const ${firstV} = (() => { try { return ${asIIFE(firstR.stmts, firstR.valueVar, firstR.endVar, pos, ind(ctx))} } catch { return null } })()`,
    `${ind(ctx)}if (${firstV}?.ok) {`,
  ]
  ctx.indent++
  stmts.push(
    `${ind(ctx)}${arrV}.push(${firstV}.value)`,
    `${ind(ctx)}${curV} = ${firstV}.span.end`,
    `${ind(ctx)}while (${curV} < input.length) {`,
  )
  ctx.indent++
  stmts.push(
    `${ind(ctx)}const ${sepV} = (() => { try { return ${iife(def.separator, curV)} } catch { return null } })()`,
    `${ind(ctx)}if (!${sepV}?.ok) break`,
    `${ind(ctx)}const ${nextV} = (() => { try { return ${iife(def.parser, `${sepV}.span.end`)} } catch { return null } })()`,
    `${ind(ctx)}if (!${nextV}?.ok) break`,
    `${ind(ctx)}${arrV}.push(${nextV}.value)`,
    `${ind(ctx)}${curV} = ${nextV}.span.end`,
  )
  ctx.indent--
  stmts.push(`${ind(ctx)}}`)
  ctx.indent--
  stmts.push(`${ind(ctx)}}`)

  return { stmts, valueVar: arrV, endVar: curV }
}

function emitRuntimeFallback(parser: Parser<unknown>, ctx: Ctx, pos: string): ER {
  const idx = ctx.runtimeParsers.length
  ctx.runtimeParsers.push(parser)
  const rv = v(ctx, '_rt')
  const vv = v(ctx, '_rtv')
  const ev = v(ctx, '_rte')
  const stmts = [
    `${ind(ctx)}const ${rv} = _rp[${idx}].parse(input, ${pos}, _ctx)`,
    `${ind(ctx)}if (!${rv}.ok) return ${rv}`,
    `${ind(ctx)}const ${vv} = ${rv}.value`,
    `${ind(ctx)}const ${ev} = ${rv}.span.end`,
  ]
  return { stmts, valueVar: vv, endVar: ev }
}

// ---------------------------------------------------------------------------
// Main dispatch
// ---------------------------------------------------------------------------
function emit(p: Parser<unknown>, ctx: Ctx, pos: string): ER {
  const def = p._def
  switch (def.tag) {
    case 'lit':      return emitLit(def, ctx, pos)
    case 'regex':    return emitRegex(def, ctx, pos)
    case 'seq':      return emitSeq(def, ctx, pos)
    case 'choice':   return emitChoice(def, ctx, pos)
    case 'many':
    case 'many1':    return emitMany(def, ctx, pos)
    case 'optional': return emitOptional(def, ctx, pos)
    case 'sepBy':    return emitSepBy(p, def, ctx, pos)
    case 'map': {
      const inner = emit(def.parser, ctx, pos)
      const fnIdx = ctx.mapFns.length
      ctx.mapFns.push(def.fn)
      const mv = v(ctx, '_mapped')
      return {
        stmts: [
          ...inner.stmts,
          `${ind(ctx)}const ${mv} = _mf[${fnIdx}](${inner.valueVar}, { start: ${pos}, end: ${inner.endVar} })`,
        ],
        valueVar: mv,
        endVar: inner.endVar,
      }
    }
    case 'skip': {
      const mainR = emit(def.main, ctx, pos)
      const skipR = emit(def.skipped, ctx, mainR.endVar)
      // skipped is optional — if it fails we just keep main's end
      const endV = v(ctx, '_skipe')
      return {
        stmts: [
          ...mainR.stmts,
          // try skipped; if fails, keep main end
          `${ind(ctx)}let ${endV} = ${mainR.endVar}`,
          `${ind(ctx)}try {`,
          ...skipR.stmts.map(s => '  ' + s),
          `${ind(ctx)}  ${endV} = ${skipR.endVar}`,
          `${ind(ctx)}} catch {}`,
        ],
        valueVar: mainR.valueVar,
        endVar: endV,
      }
    }
    case 'trivia':
    case 'grammar':  return emit(def.parser, ctx, pos)
    default:         return emitRuntimeFallback(p, ctx, pos)
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export type CompiledParser<T> = {
  parse(input: string, pos?: number): ParseResult<T>
  /** The generated source (for inspection / future source maps) */
  source: string
  /**
   * A self-contained JS expression (IIFE) that evaluates to a parse function.
   * Safe to inline directly into transformed source — no external references
   * except for runtime-fallback parsers embedded via closures.
   * Returns null if the parser cannot be fully inlined (e.g. contains user
   * closures that can't be serialized).
   */
  inlineExpression: string | null
}

export function compile<T>(parser: Parser<T>): CompiledParser<T> {
  const ctx: Ctx = {
    vars: 0,
    indent: 1,
    regexDecls: [],
    mapFns: [],
    runtimeParsers: [],
    needsCollator: false,
  }

  const r = emit(parser as Parser<unknown>, ctx, '_pos')

  const collatorDecl = ctx.needsCollator
    ? `const _collator = new Intl.Collator(undefined, { sensitivity: 'accent' })\n`
    : ''

  const source = [
    ...ctx.regexDecls,
    '',
    `${collatorDecl}function _parse(input, _pos, _rp, _mf, _ctx) {`,
    `  let pos = _pos`,
    ...r.stmts,
    `  return { ok: true, value: ${r.valueVar}, span: { start: _pos, end: ${r.endVar} } }`,
    `}`,
  ].join('\n')

  const fn = new Function('input', '_pos', '_rp', '_mf', '_ctx', [
    ...ctx.regexDecls,
    collatorDecl,
    `let pos = _pos`,
    ...r.stmts,
    `return { ok: true, value: ${r.valueVar}, span: { start: _pos, end: ${r.endVar} } }`,
  ].join('\n')) as (
    input: string,
    pos: number,
    rp: Array<Parser<unknown>>,
    mf: Array<(v: unknown, span: { start: number; end: number }) => unknown>,
    ctx: ParseContext,
  ) => ParseResult<T>

  const defaultCtx: ParseContext = { trackLines: false }

  // Build an inline expression only when there are no runtime fallbacks or
  // map-function closures that can't be serialized.
  const canInline = ctx.runtimeParsers.length === 0 && ctx.mapFns.length === 0
  const inlineExpression: string | null = canInline ? buildInlineExpression(ctx, r, collatorDecl) : null

  return {
    source,
    inlineExpression,
    parse(input: string, pos = 0): ParseResult<T> {
      return fn(input, pos, ctx.runtimeParsers, ctx.mapFns, defaultCtx)
    },
  }
}

function buildInlineExpression(
  ctx: Ctx,
  r: ER,
  collatorDecl: string,
): string {
  const bodyLines = [
    `  let pos = _pos`,
    ...r.stmts.map(s => `  ${s}`),
    `  return { ok: true, value: ${r.valueVar}, span: { start: _pos, end: ${r.endVar} } }`,
  ]

  const innerFn = [
    `function(input, _pos, _ctx) {`,
    ...bodyLines,
    `}`,
  ].join('\n')

  if (ctx.regexDecls.length === 0 && !collatorDecl) {
    return innerFn
  }

  // Wrap in IIFE to hoist regex/collator declarations
  return [
    `/* @__PURE__ */ (() => {`,
    ...ctx.regexDecls.map(d => `  ${d}`),
    collatorDecl ? `  ${collatorDecl.trim()}` : '',
    `  return ${innerFn}`,
    `})()`,
  ].filter(Boolean).join('\n')
}
