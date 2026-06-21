/**
 * Compiler parity: for every input, compile(parser).parse(input) must equal
 * parser.parse(input, 0, ctx) — same ok/fail, same value, same span offsets.
 */
import { describe, it, expect } from 'vitest'
import {
  lit, regex, seq, choice, many, many1, optional, sepBy, map, grammar,
  parse as runtimeParse, compile,
} from '../../src/index.ts'
import { trivia } from '../../src/combinators/map.ts'

function parity<T>(label: string, parser: ReturnType<typeof compile<T>> extends infer _ ? typeof compile<T> extends (p: infer P) => infer _ ? P : never : never, inputs: string[]) {
  const compiled = compile(parser)
  for (const input of inputs) {
    it(`${label} — ${JSON.stringify(input)}`, () => {
      const interpreted = runtimeParse(parser, input)
      const compiledResult = compiled.parse(input)
      expect(compiledResult.ok).toBe(interpreted.ok)
      if (interpreted.ok && compiledResult.ok) {
        expect(compiledResult.value).toEqual(interpreted.value)
        expect(compiledResult.span.start).toBe(interpreted.span.start)
        expect(compiledResult.span.end).toBe(interpreted.span.end)
      }
    })
  }
}

// Convenience: parity for a Parser<T>
function par<T>(label: string, parser: import('../../src/index.ts').Parser<T>, inputs: string[]) {
  const compiled = compile(parser)
  for (const input of inputs) {
    it(`${label} — ${JSON.stringify(input)}`, () => {
      const interpreted = runtimeParse(parser, input)
      const compiledResult = compiled.parse(input)
      expect(compiledResult.ok).toBe(interpreted.ok)
      if (interpreted.ok && compiledResult.ok) {
        expect(compiledResult.value).toEqual(interpreted.value)
        expect(compiledResult.span.start).toBe(interpreted.span.start)
        expect(compiledResult.span.end).toBe(interpreted.span.end)
      }
    })
  }
}

describe('lit — compiler parity', () => {
  par('exact match', lit('hello'), ['hello', 'world', 'hell', 'hello world'])
  par('single char', lit('x'), ['x', 'y', ''])
  par('case-insensitive', lit('GET', { caseInsensitive: true }), ['GET', 'get', 'Get', 'POST'])
  par('long string (>4 chars)', lit('Authorization'), ['Authorization', 'authorization', 'Auth'])
})

describe('regex — compiler parity', () => {
  par('digits', regex(/[0-9]+/), ['123', 'abc', '0', '99rest'])
  par('word chars', regex(/\w+/), ['hello', '123', '!@#'])
  par('optional group', regex(/foo(bar)?/), ['foo', 'foobar', 'baz'])
})

describe('seq — compiler parity', () => {
  par('two lits', seq(lit('hello'), lit(' world')), ['hello world', 'hello', 'goodbye'])
  par('lit + regex', seq(lit('x='), regex(/[0-9]+/)), ['x=42', 'x=', 'y=42'])
  par('three parts', seq(lit('('), regex(/[^)]+/), lit(')')), ['(hello)', '()', 'hello'])
})

describe('choice — compiler parity (disjoint)', () => {
  const p = choice(lit('apple'), lit('banana'), lit('cherry'))
  par('disjoint first chars', p, ['apple', 'banana', 'cherry', 'durian', 'ap'])
})

describe('choice — compiler parity (overlapping)', () => {
  const p = choice(lit('foo'), lit('far'), lit('baz'))
  par('overlapping first chars (f)', p, ['foo', 'far', 'baz', 'fob', 'bar'])
})

describe('many — compiler parity', () => {
  par('many lit', many(lit('ab')), ['ababab', 'ab', '', 'abx'])
  par('many regex', many(regex(/[0-9]/)), ['123', '', 'abc', '1a'])
})

describe('many1 — compiler parity', () => {
  par('many1 lit', many1(lit('a')), ['aaa', 'a', '', 'b', 'ab'])
})

describe('optional — compiler parity', () => {
  par('optional present', optional(lit('foo')), ['foo', 'bar', ''])
})

describe('sepBy — compiler parity', () => {
  par('comma-separated digits', sepBy(regex(/[0-9]+/), lit(',')), ['1,2,3', '42', '', 'a,b'])
})

describe('map — compiler parity', () => {
  const p = map(regex(/[0-9]+/), s => parseInt(s, 10))
  par('parse integer', p, ['42', '0', '999', 'abc'])
})

describe('seq with map — compiler parity', () => {
  const p = map(
    seq(lit('('), regex(/[^)]+/), lit(')')),
    ([, inner]) => inner.trim()
  )
  par('extract inner', p, ['(hello)', '( world )', '()invalid', 'nope'])
})

describe('HTTP request line — compiler parity', () => {
  const method = choice(
    lit('GET'), lit('POST'), lit('PUT'), lit('DELETE'),
    lit('PATCH'), lit('HEAD'), lit('OPTIONS')
  )
  const requestLine = map(
    seq(method, lit(' '), regex(/[^\s]+/), lit(' '), lit('HTTP/'), regex(/1\.[01]/), lit('\r\n')),
    ([m, , target, , , ver]) => ({ method: m, target, version: `HTTP/${ver}` })
  )
  par('request line', requestLine, [
    'GET / HTTP/1.1\r\n',
    'POST /api HTTP/1.0\r\n',
    'BREW / HTTP/1.1\r\n',
  ])
})
