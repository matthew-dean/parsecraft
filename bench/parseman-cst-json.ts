/**
 * Parseman CST JSON grammar for benchmarking the trivia-capture path.
 *
 * Two exported factories:
 *   buildParsermanCSTJSON()      — captureTrivia: true  (trivia in rawChildren)
 *   buildParsermanCSTJSONNoTriv() — captureTrivia: false (trivia skipped silently)
 *
 * Commas are included in the trivia pattern (like GraphQL's optional-comma
 * convention) so the grammar stays simple. The benchmark measures tree-building
 * overhead, not grammar completeness.
 */
import {
  rules, node, regex, literal, choice, many, sequence, trivia, parser,
  type CSTNode, type CSTLeaf, type CSTError,
} from '../src/index.ts'

const ws = trivia(regex(/[ \t\n\r,]*/))

function mkNode(
  type: string,
  children: ReadonlyArray<CSTNode | CSTLeaf | CSTError>,
  span: { start: number; end: number },
  state: unknown,
): CSTNode {
  return { _tag: 'node', type, span, state, children }
}

function makeCstJsonRoot(captureTrivia: boolean) {
  const stringRe = regex(/"(?:[^"\\]|\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4}))*"/)
  const numberRe = regex(/-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)

  const { Value } = rules(g => {
    const StringVal = node('StringVal', stringRe, (ch, _r, span, _tl, state) =>
      mkNode('StringVal', ch as CSTNode['children'], span, state))
    const NumberVal = node('NumberVal', numberRe, (ch, _r, span, _tl, state) =>
      mkNode('NumberVal', ch as CSTNode['children'], span, state))
    const True = node('True', literal('true'), (ch, _r, span, _tl, state) =>
      mkNode('True', ch as CSTNode['children'], span, state))
    const False = node('False', literal('false'), (ch, _r, span, _tl, state) =>
      mkNode('False', ch as CSTNode['children'], span, state))
    const Null = node('Null', literal('null'), (ch, _r, span, _tl, state) =>
      mkNode('Null', ch as CSTNode['children'], span, state))
    const Object = node(
      'Object',
      sequence(literal('{'), many(sequence(g.StringVal, literal(':'), g.Value)), literal('}')),
      (ch, _r, span, _tl, state) => mkNode('Object', ch as CSTNode['children'], span, state),
    )
    const Array = node(
      'Array',
      sequence(literal('['), many(g.Value), literal(']')),
      (ch, _r, span, _tl, state) => mkNode('Array', ch as CSTNode['children'], span, state),
    )
    const Value = node(
      'Value',
      choice(g.Object, g.Array, g.StringVal, g.NumberVal, g.True, g.False, g.Null),
      (ch, _r, span, _tl, state) => mkNode('Value', ch as CSTNode['children'], span, state),
    )
    return { Value, Object, Array, StringVal, NumberVal, True, False, Null }
  })

  return parser({ trivia: ws, captureTrivia }, Value)
}

export function buildParsermanCSTJSON(): (input: string) => unknown {
  const root = makeCstJsonRoot(true)
  return (input: string) => {
    const r = root.parse(input)
    if (!r.ok) throw new Error('parse failed')
    return r.value
  }
}

export function buildParsermanCSTJSONNoTriv(): (input: string) => unknown {
  const root = makeCstJsonRoot(false)
  return (input: string) => {
    const r = root.parse(input)
    if (!r.ok) throw new Error('parse failed')
    return r.value
  }
}
