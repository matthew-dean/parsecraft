import { describe, it, expect } from 'vitest'
import { lit, regex, many, many1, optional, sepBy, parse } from '../../src/index.ts'

describe('many', () => {
  it('matches zero times', () => {
    const r = parse(many(lit('x')), '')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual([])
  })

  it('matches multiple times', () => {
    const r = parse(many(lit('ab')), 'ababab')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual(['ab', 'ab', 'ab'])
  })

  it('stops at non-match', () => {
    const r = parse(many(lit('a')), 'aaab')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value).toEqual(['a', 'a', 'a'])
      expect(r.span.end).toBe(3)
    }
  })
})

describe('many1', () => {
  it('fails on zero matches', () => {
    expect(parse(many1(lit('x')), '').ok).toBe(false)
  })

  it('succeeds on one or more', () => {
    const r = parse(many1(lit('a')), 'aaa')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toHaveLength(3)
  })
})

describe('optional', () => {
  it('returns value when matched', () => {
    const r = parse(optional(lit('hi')), 'hi')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('hi')
  })

  it('returns null when not matched', () => {
    const r = parse(optional(lit('hi')), 'bye')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBeNull()
  })
})

describe('sepBy', () => {
  it('parses comma-separated values', () => {
    const p = sepBy(regex(/[a-z]+/), lit(','))
    const r = parse(p, 'foo,bar,baz')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual(['foo', 'bar', 'baz'])
  })

  it('returns empty on no match', () => {
    const p = sepBy(regex(/[a-z]+/), lit(','))
    const r = parse(p, '123')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual([])
  })
})
