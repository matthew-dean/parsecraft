import { describe, it, expect } from 'vitest'
import { lit, seq, regex, many, parse, grammar } from '../../src/index.ts'
import { trivia } from '../../src/combinators/map.ts'

describe('seq', () => {
  it('matches all parts in order', () => {
    const p = seq(lit('hello'), lit(' '), lit('world'))
    const r = parse(p, 'hello world')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value).toEqual(['hello', ' ', 'world'])
      expect(r.span).toEqual({ start: 0, end: 11 })
    }
  })

  it('fails if any part fails', () => {
    const p = seq(lit('hello'), lit(' '), lit('world'))
    expect(parse(p, 'hello earth').ok).toBe(false)
  })

  it('auto-skips trivia between terms', () => {
    const ws = trivia(regex(/\s+/))
    const p = grammar({ trivia: ws }, seq(lit('foo'), lit('bar')))
    const r = parse(p, 'foo   bar')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual(['foo', 'bar'])
  })

  it('inherits first set from first parser', () => {
    const p = seq(lit('abc'), lit('def'))
    expect(p._meta.firstSet).toMatchObject({ kind: 'ranges' })
  })
})
