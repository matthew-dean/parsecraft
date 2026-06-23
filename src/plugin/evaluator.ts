/**
 * Statically evaluates parseman combinator call expressions from an oxc AST
 * into actual Combinator<unknown> objects by calling the real library functions.
 *
 * Returns null for anything unresolvable (external variables, template literals,
 * computed keys, etc.) — callers leave those as-is.
 */
import type {
  Expression, Node,
  ArrowFunctionExpression, Function as OxcFunction,
  ReturnStatement,
  VariableDeclaration, VariableDeclarator,
  StaticMemberExpression,
  ObjectExpression, ObjectProperty,
} from '@oxc-project/types'
import type { Combinator } from '../types.ts'
import { ref } from '../combinators/ref.ts'
import * as parseman from '../index.ts'

// ---------------------------------------------------------------------------
// Scope types
//
// Each scope entry is either a raw Combinator, or an enriched entry that
// carries the mapFnSources this combinator will contribute when the codegen
// traverses its subtree.  The enriched form is needed so that anyValue can
// "replay" those sources when the combinator is referenced by another
// expression — keeping mapFnSources aligned with what ctx.mapFns builds.
// ---------------------------------------------------------------------------
export type ScopeEntry = {
  combi: Combinator<unknown>
  mfSrcs: string[]
}
export type Scope = Map<string, ScopeEntry>

// Internal XScope also holds non-Combinator values (g proxy objects etc.)
type XScopeVal = ScopeEntry | unknown
type XScope = Map<string, XScopeVal>

const SUPPORTED: Record<string, (...args: unknown[]) => Combinator<unknown>> = {
  literal:   (...a) => parseman.literal(a[0] as string, a[1] as parseman.LiteralOptions | undefined),
  regex:     (...a) => parseman.regex(a[0] as RegExp, a[1] as string | undefined),
  sequence:  (...a) => (parseman.sequence as (...p: Combinator<unknown>[]) => Combinator<unknown[]>)(...(a as Combinator<unknown>[])),
  choice:    (...a) => (parseman.choice as (...p: Combinator<unknown>[]) => Combinator<unknown>)(...(a as Combinator<unknown>[])),
  many:      (...a) => parseman.many(a[0] as Combinator<unknown>),
  oneOrMore: (...a) => parseman.oneOrMore(a[0] as Combinator<unknown>),
  optional:  (...a) => parseman.optional(a[0] as Combinator<unknown>),
  sepBy:     (...a) => parseman.sepBy(a[0] as Combinator<unknown>, a[1] as Combinator<unknown>),
  trivia:    (...a) => parseman.trivia(a[0] as Combinator<unknown>),
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isScopeEntry(v: unknown): v is ScopeEntry {
  return !!v && typeof v === 'object' && 'combi' in v && 'mfSrcs' in v
}

function isCombinator(v: unknown): v is Combinator<unknown> {
  return !!v && typeof v === 'object' && '_def' in v
}

/**
 * Resolve an identifier from scope.
 * If the entry carries mfSrcs, replay them into `mfs` so that the
 * overall accumulator stays aligned with what codegen will push.
 */
function scopeGet(scope: XScope, name: string, mfs?: string[]): Combinator<unknown> | null {
  const entry = scope.get(name)
  if (!entry) return null
  if (isScopeEntry(entry)) {
    if (mfs && entry.mfSrcs.length > 0) mfs.push(...entry.mfSrcs)
    return entry.combi
  }
  if (isCombinator(entry)) return entry
  return null
}

// ---------------------------------------------------------------------------
// Core evaluators
// ---------------------------------------------------------------------------

/**
 * Evaluate a call expression to a Combinator.
 * `mfs` accumulates mapFn source texts in depth-first order — must match
 * what codegen pushes to ctx.mapFns when it traverses the same tree.
 */
function exprToCombi(node: Expression, scope: XScope, code?: string, mfs?: string[]): Combinator<unknown> | null {
  if (node.type === 'Identifier') return scopeGet(scope, node.name, mfs)

  if (node.type !== 'CallExpression') return null

  const callee = node.callee
  if (callee.type !== 'Identifier') return null

  // transform(inner, fn) — capture fn source text before pushing to mfs
  if (callee.name === 'transform' && code !== undefined && mfs !== undefined) {
    const [parserArg, fnArg] = node.arguments
    if (!parserArg || !fnArg || parserArg.type === 'SpreadElement' || fnArg.type === 'SpreadElement') return null
    const inner = anyValue(parserArg as Expression, scope, code, mfs)
    if (!isCombinator(inner)) return null
    mfs.push(code.slice((fnArg as Expression).start, (fnArg as Expression).end))
    try {
      return parseman.transform(inner, (v: unknown) => v)
    } catch { return null }
  }

  // rules(factory) — handled separately by evaluateParserFactory; signal null here
  if (callee.name === 'rules') return null

  // sepBy(item, sep) — emitSepBy traverses: item (first probe), sep, item (loop body)
  // We must push item's mfSrcs twice to stay aligned with ctx.mapFns.
  if (callee.name === 'sepBy') {
    const [itemArg, sepArg] = node.arguments
    if (!itemArg || !sepArg || itemArg.type === 'SpreadElement' || sepArg.type === 'SpreadElement') return null
    const itemMfs: string[] = []
    const itemCombi = anyValue(itemArg as Expression, scope, code, itemMfs)
    if (!isCombinator(itemCombi)) return null
    const sepMfs: string[] = []
    const sepCombi = anyValue(sepArg as Expression, scope, code, sepMfs)
    if (!isCombinator(sepCombi)) return null
    if (mfs) mfs.push(...itemMfs, ...sepMfs, ...itemMfs)
    try { return parseman.sepBy(itemCombi, sepCombi) } catch { return null }
  }

  // oneOrMore(item) — emitMany(min=1) traverses: item (mandatory first), item (loop body)
  if (callee.name === 'oneOrMore') {
    const [itemArg] = node.arguments
    if (!itemArg || itemArg.type === 'SpreadElement') return null
    const itemMfs: string[] = []
    const itemCombi = anyValue(itemArg as Expression, scope, code, itemMfs)
    if (!isCombinator(itemCombi)) return null
    if (mfs) mfs.push(...itemMfs, ...itemMfs)
    try { return parseman.oneOrMore(itemCombi) } catch { return null }
  }

  const factory = SUPPORTED[callee.name]
  if (!factory) return null

  const args = node.arguments.map(arg => {
    if (arg.type === 'SpreadElement') return null
    return anyValue(arg as Expression, scope, code, mfs)
  })
  if (args.some(a => a === null)) return null

  try {
    return factory(...(args as unknown[]))
  } catch { return null }
}

/** Evaluate any expression to its JS value (not necessarily a Combinator). */
function anyValue(node: Expression, scope: XScope, code?: string, mfs?: string[]): unknown {
  if (node.type === 'Literal') {
    if ('regex' in node && node.regex !== null && node.regex !== undefined) {
      return new RegExp(node.regex.pattern, node.regex.flags)
    }
    return node.value
  }

  if (node.type === 'ObjectExpression') {
    const obj: Record<string, unknown> = {}
    for (const prop of node.properties) {
      if (prop.type !== 'Property') return null
      if ((prop as unknown as ObjectProperty).computed) return null
      const key = (prop as unknown as ObjectProperty).key.type === 'Identifier'
        ? ((prop as unknown as ObjectProperty).key as { name: string }).name
        : (prop as unknown as ObjectProperty).key.type === 'Literal'
        ? String(((prop as unknown as ObjectProperty).key as { value: unknown }).value)
        : null
      if (key === null) return null
      obj[key] = anyValue((prop as unknown as ObjectProperty).value as Expression, scope, code, mfs)
    }
    return obj
  }

  if (node.type === 'Identifier') {
    if (node.name === 'undefined') return undefined
    const entry = scope.get(node.name) ?? null
    if (isScopeEntry(entry)) {
      if (mfs && entry.mfSrcs.length > 0) mfs.push(...entry.mfSrcs)
      return entry.combi
    }
    return entry
  }

  // MemberExpression — handles g.ruleName references inside parser() factories
  if (node.type === 'MemberExpression') {
    const mem = node as unknown as StaticMemberExpression
    const obj = anyValue(mem.object as Expression, scope, code, mfs)
    if (!obj || typeof obj !== 'object') return null
    if ((node as unknown as { computed: boolean }).computed) {
      const key = anyValue((node as unknown as { property: Expression }).property, scope, code, mfs)
      if (typeof key !== 'string' && typeof key !== 'number') return null
      return (obj as Record<string | number, unknown>)[key] ?? null
    }
    const propName = (mem.property as { name?: string }).name
    if (!propName) return null
    return (obj as Record<string, unknown>)[propName] ?? null
  }

  if (node.type === 'CallExpression') return exprToCombi(node, scope, code, mfs)

  return null
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Evaluate a single combinator expression. Returns null if unresolvable. */
export function evaluateExpr(
  node: Expression,
  scope: Scope,
  code?: string,
  mapFnSources?: string[],
): Combinator<unknown> | null {
  return exprToCombi(node, scope as XScope, code, mapFnSources)
}

/**
 * Evaluate a `parser(g => { ... return { ruleName: combinator, ... } })` call.
 * Returns a map of rule names → defined Combinators, or null if the factory
 * can't be statically evaluated.
 *
 * mapFnSources is populated with the sources for mapFns that codegen will push
 * when compiling each returned rule — each rule's entry in the map will produce
 * a sub-slice of mapFnSources aligned to its specific ctx.mapFns.
 *
 * Important: this function uses a SEPARATE accumulator for body statement
 * evaluation so that only the return-expression phase adds entries to the
 * caller-provided mapFnSources (which is what compile() will receive).
 * The body-phase entries are stored as `mfSrcs` on localScope entries and
 * replayed when those entries are referenced during return evaluation.
 */
export function evaluateParserFactory(
  factoryNode: Expression,
  scope: Scope,
  code: string,
  mapFnSources: string[],  // receives ONLY the return-expression mfSrcs
): Map<string, Combinator<unknown>> | null {
  if (factoryNode.type !== 'ArrowFunctionExpression' && factoryNode.type !== 'FunctionDeclaration' && factoryNode.type !== 'FunctionExpression') return null

  const factory = factoryNode as unknown as ArrowFunctionExpression | OxcFunction
  const params = factory.params
  if (params.length !== 1) return null
  const param = params[0] as unknown as { type: string; name?: string }
  // FormalParameter is { decorators? } & BindingPattern — BindingIdentifier has type "Identifier"
  const proxyName = param.type === 'Identifier' ? param.name ?? null : null
  if (!proxyName) return null

  const body = factory.body
  if (!body) return null
  const statements: VariableDeclaration[] = []
  let returnExpr: Expression | null = null

  if ((body as unknown as { type: string }).type === 'BlockStatement') {
    const stmts = (body as unknown as { body: unknown[] }).body
    for (const stmt of stmts) {
      const s = stmt as { type: string }
      if (s.type === 'ReturnStatement') {
        returnExpr = ((s as unknown as ReturnStatement).argument ?? null) as Expression | null
        break
      }
      if (s.type === 'VariableDeclaration') {
        statements.push(s as unknown as VariableDeclaration)
      } else {
        return null // unsupported statement type
      }
    }
  } else {
    // Concise arrow body: g => ({ ... })
    returnExpr = body as unknown as Expression
  }

  if (!returnExpr) return null

  // Unwrap parenthesized expression if needed
  const retObj = returnExpr.type === 'ParenthesizedExpression'
    ? (returnExpr as unknown as { expression: Expression }).expression
    : returnExpr
  if (retObj.type !== 'ObjectExpression') return null

  // Pre-scan return object to get rule names and create refs
  const ruleRefs = new Map<string, Combinator<unknown> & { define(p: Combinator<unknown>): void }>()
  for (const prop of (retObj as unknown as ObjectExpression).properties) {
    if (prop.type !== 'Property') return null
    if ((prop as unknown as ObjectProperty).computed) return null
    const p = prop as unknown as ObjectProperty
    const key = p.key.type === 'Identifier' ? (p.key as unknown as { name: string }).name
      : p.key.type === 'Literal' ? String((p.key as unknown as { value: unknown }).value)
      : null
    if (!key) return null
    ruleRefs.set(key, ref<unknown>() as Combinator<unknown> & { define(p: Combinator<unknown>): void })
  }

  // Build local extended scope: outer scope (typed as XScope) + g proxy object.
  // Note: outer ScopeEntry values carry their mfSrcs and will be replayed by
  // scopeGet() when body statements or return expressions reference them.
  const localScope: XScope = new Map(scope as XScope)
  localScope.set(proxyName, Object.fromEntries(ruleRefs))

  // ── Phase 1: evaluate body statements ────────────────────────────────────
  // Use a LOCAL accumulator so body-phase mfSrcs don't end up in mapFnSources.
  // Each declaration's mfSrcs slice is stored on the localScope entry so it
  // gets replayed when the return-phase references that declaration.
  const bodyMfs: string[] = []

  for (const stmt of statements) {
    for (const d of stmt.declarations) {
      const decl = d as unknown as VariableDeclarator
      if (!decl.init) return null
      const id = decl.id as unknown as { type: string; name?: string }
      if (id.type !== 'Identifier' && id.type !== 'BindingIdentifier') return null
      const name = id.name!

      const before = bodyMfs.length
      const val = anyValue(decl.init as unknown as Expression, localScope, code, bodyMfs)
      if (val === null) return null

      const thisDeclMfSrcs = bodyMfs.slice(before)
      if (isCombinator(val)) {
        localScope.set(name, { combi: val, mfSrcs: thisDeclMfSrcs } satisfies ScopeEntry)
      } else {
        localScope.set(name, val)
      }
    }
  }

  // ── Phase 2: evaluate return values and define refs ───────────────────────
  // Uses mapFnSources (the caller-provided accumulator) — only these entries
  // will be in mapFnSources when compile() is called on the resulting rules.
  // Scope replay ensures outer and body combinators contribute their mfSrcs.
  for (const prop of (retObj as unknown as ObjectExpression).properties) {
    const p = prop as unknown as ObjectProperty
    const key = p.key.type === 'Identifier' ? (p.key as unknown as { name: string }).name
      : String((p.key as unknown as { value: unknown }).value)
    const val = anyValue(p.value as Expression, localScope, code, mapFnSources)
    if (!isCombinator(val)) return null
    ruleRefs.get(key)!.define(val)
  }

  return ruleRefs as Map<string, Combinator<unknown>>
}

/** Check if an AST node references any name from the given scope or names set. */
export function referencesAny(node: Node, names: Set<string>, scope: Scope): boolean {
  if (node.type === 'Identifier') {
    return names.has(node.name) || scope.has(node.name)
  }
  for (const key of Object.keys(node) as (keyof typeof node)[]) {
    const child = node[key]
    if (!child || typeof child !== 'object') continue
    if (Array.isArray(child)) {
      if (child.some(c => c && typeof c === 'object' && 'type' in c && referencesAny(c as Node, names, scope))) return true
    } else if ('type' in child) {
      if (referencesAny(child as Node, names, scope)) return true
    }
  }
  return false
}
