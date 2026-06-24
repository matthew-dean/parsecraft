/**
 * Parseman CST JSON grammar for benchmarking the trivia-capture path.
 *
 * Two exported factories:
 *   buildParsermanCSTJSON()      — _captureTrivia: true  (trivia in rawChildren)
 *   buildParsermanCSTJSONNoTriv() — _captureTrivia: false (trivia skipped silently)
 *
 * Commas are included in the trivia pattern (like GraphQL's optional-comma
 * convention) so the grammar stays simple. The benchmark measures tree-building
 * overhead, not grammar completeness.
 */
import { Parser, type Refs, regex, literal, choice, many, sequence, trivia } from '../src/index.ts'

// Whitespace + commas as trivia (simplifies Object/Array grammar)
const ws = trivia(regex(/[ \t\n\r,]*/))

class JSONWithTrivia extends Parser {
  protected _trivia      = ws
  protected _captureTrivia = true
  protected _defaultRule = 'Value' as const

  StringVal = regex(/"(?:[^"\\]|\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4}))*"/)
  NumberVal = regex(/-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)
  True      = literal('true')
  False     = literal('false')
  Null      = literal('null')

  Value  = (g: Refs<this>) => choice(g.Object, g.Array, g.StringVal, g.NumberVal, g.True, g.False, g.Null)
  Object = (g: Refs<this>) => sequence(literal('{'), many(sequence(g.StringVal, literal(':'), g.Value)), literal('}'))
  Array  = (g: Refs<this>) => sequence(literal('['), many(g.Value), literal(']'))
}

class JSONNoTrivia extends Parser {
  protected _trivia      = ws
  protected _captureTrivia = false
  protected _defaultRule = 'Value' as const

  StringVal = regex(/"(?:[^"\\]|\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4}))*"/)
  NumberVal = regex(/-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)
  True      = literal('true')
  False     = literal('false')
  Null      = literal('null')

  Value  = (g: Refs<this>) => choice(g.Object, g.Array, g.StringVal, g.NumberVal, g.True, g.False, g.Null)
  Object = (g: Refs<this>) => sequence(literal('{'), many(sequence(g.StringVal, literal(':'), g.Value)), literal('}'))
  Array  = (g: Refs<this>) => sequence(literal('['), many(g.Value), literal(']'))
}

export function buildParsermanCSTJSON(): (input: string) => unknown {
  const g = new JSONWithTrivia()
  return (input: string) => {
    const doc = g.parse(input)
    if (!doc.tree) throw new Error('parse failed')
    return doc.tree
  }
}

export function buildParsermanCSTJSONNoTriv(): (input: string) => unknown {
  const g = new JSONNoTrivia()
  return (input: string) => {
    const doc = g.parse(input)
    if (!doc.tree) throw new Error('parse failed')
    return doc.tree
  }
}
