import { describe, it, expect } from 'vitest'
import { regex } from '../../src/combinators/regex.ts'
import { choice } from '../../src/combinators/choice.ts'
import { oneOrMore } from '../../src/combinators/repeat.ts'
import { trivia } from '../../src/combinators/map.ts'
import { parser } from '../../src/combinators/grammar.ts'
import { literal } from '../../src/combinators/literal.ts'
import { sequence } from '../../src/combinators/sequence.ts'
import { node } from '../../src/combinators/node.ts'
import { compile } from '../../src/compiler/codegen.ts'
import { analyzeTriviaFastPath } from '../../src/compiler/trivia-fast-path.ts'

describe('trivia fast path — detection', () => {
  const ws = regex(/[ \t\n\r\f]+/)
  const comment = regex(/\/\*(?:[^*]|\*(?!\/))*\*\//)

  it('detects CSS rw shape', () => {
    const rw = trivia(oneOrMore(choice(ws, comment)))
    expect(analyzeTriviaFastPath(rw)).toBe('wsComments')
  })

  it('does not fast-path merged alternation regex (one arm per parse)', () => {
    const rw = trivia(regex(/[ \t\n\r\f]+|\/\*(?:[^*]|\*(?!\/))*\*\//))
    expect(analyzeTriviaFastPath(rw)).toBeNull()
  })

  it('detects ws-only trivia', () => {
    expect(analyzeTriviaFastPath(trivia(regex(/[ \t]+/)))).toBe('wsOnly')
    expect(analyzeTriviaFastPath(trivia(oneOrMore(ws)))).toBe('wsOnly')
  })

  it('returns null for non-matching trivia', () => {
    expect(analyzeTriviaFastPath(trivia(regex(/\s+/)))).toBeNull()
    expect(analyzeTriviaFastPath(trivia(regex(/#[0-9a-f]+/)))).toBeNull()
  })
})

describe('trivia fast path — codegen', () => {
  it('emits charCodeAt loop for capturing CST grammar with CSS-like trivia', () => {
    const ws = regex(/[ \t\n\r\f]+/)
    const comment = regex(/\/\*(?:[^*]|\*(?!\/))*\*\//)
    const rw = trivia(oneOrMore(choice(ws, comment)))
    const p = node(
      'Root',
      parser({ trivia: rw }, sequence(literal('a'), literal('b'))),
      () => null,
    )
    const src = compile(p).source
    expect(src).toContain('function _tf0(input, _pos, _ctx, _cap)')
    expect(src).toContain('charCodeAt(_e + 1) === 42')
    expect(src).not.toMatch(/function _tf0[\s\S]*_re\d+\.exec/)
  })
})
