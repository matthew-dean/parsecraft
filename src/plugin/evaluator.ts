/**
 * Statically evaluates parsecraft combinator call expressions from an oxc AST
 * into actual Parser<unknown> objects by calling the real library functions.
 *
 * Returns null for anything unresolvable (user closures, external variables,
 * template literals, computed keys, etc.) — callers leave those as-is.
 */
import type { Expression, Node } from '@oxc-project/types'
import type { Parser } from '../types.ts'
import * as parsecraft from '../index.ts'

export type Scope = Map<string, Parser<unknown>>

const SUPPORTED: Record<string, (...args: unknown[]) => Parser<unknown>> = {
  literal:   (...a) => parsecraft.literal(a[0] as string, a[1] as parsecraft.LiteralOptions | undefined),
  regex:     (...a) => parsecraft.regex(a[0] as RegExp, a[1] as string | undefined),
  sequence:  (...a) => (parsecraft.sequence as (...p: Parser<unknown>[]) => Parser<unknown[]>)(...(a as Parser<unknown>[])),
  choice:    (...a) => (parsecraft.choice as (...p: Parser<unknown>[]) => Parser<unknown>)(...(a as Parser<unknown>[])),
  many:      (...a) => parsecraft.many(a[0] as Parser<unknown>),
  oneOrMore: (...a) => parsecraft.oneOrMore(a[0] as Parser<unknown>),
  optional:  (...a) => parsecraft.optional(a[0] as Parser<unknown>),
  sepBy:     (...a) => parsecraft.sepBy(a[0] as Parser<unknown>, a[1] as Parser<unknown>),
  // transform / grammar intentionally omitted — take user closures that can't be serialized
}

/** Try to evaluate an oxc AST Expression as a parsecraft Parser. Returns null if impossible. */
export function evaluateExpr(node: Expression, scope: Scope): Parser<unknown> | null {
  if (node.type === 'Identifier') return scope.get(node.name) ?? null

  if (node.type !== 'CallExpression') return null

  const callee = node.callee
  if (callee.type !== 'Identifier') return null

  const factory = SUPPORTED[callee.name]
  if (!factory) return null

  const args = node.arguments.map(arg => {
    if (arg.type === 'SpreadElement') return null
    return evaluateArg(arg as Expression, scope)
  })
  if (args.some(a => a === null)) return null

  try {
    return factory(...(args as unknown[]))
  } catch {
    return null
  }
}

/** Evaluate any expression to its JS value (string, number, boolean, RegExp, object, or Parser). */
function evaluateArg(node: Expression, scope: Scope): unknown {
  // oxc unifies all literal types under type: "Literal", discriminated by value/regex shape
  if (node.type === 'Literal') {
    if ('regex' in node && node.regex !== null && node.regex !== undefined) {
      return new RegExp(node.regex.pattern, node.regex.flags)
    }
    return node.value  // string | number | boolean | null
  }

  if (node.type === 'ObjectExpression') {
    const obj: Record<string, unknown> = {}
    for (const prop of node.properties) {
      if (prop.type !== 'Property') return null
      if (prop.computed) return null
      const key = prop.key.type === 'Identifier' ? prop.key.name
        : prop.key.type === 'Literal' ? String(prop.key.value)
        : null
      if (key === null) return null
      obj[key] = evaluateArg(prop.value as Expression, scope)
    }
    return obj
  }

  if (node.type === 'Identifier') {
    if (node.name === 'undefined') return undefined
    return scope.get(node.name) ?? null
  }

  if (node.type === 'CallExpression') return evaluateExpr(node, scope)

  return null
}

/** Check if an AST node references any name from the given set (used to detect parsecraft usage). */
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
