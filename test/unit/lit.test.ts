import { describe, it, expect } from 'vitest'
import { lit, parse } from '../../src/index.ts'

describe('lit', () => {
  it('matches an exact string', () => {
    const r = parse(lit('hello'), 'hello')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value).toBe('hello')
      expect(r.span).toEqual({ start: 0, end: 5 })
    }
  })

  it('fails on mismatch', () => {
    const r = parse(lit('hello'), 'world')
    expect(r.ok).toBe(false)
  })

  it('fails when input is too short', () => {
    const r = parse(lit('hello'), 'he')
    expect(r.ok).toBe(false)
  })

  it('matches case-insensitively', () => {
    const p = lit('GET', { caseInsensitive: true })
    expect(parse(p, 'GET').ok).toBe(true)
    expect(parse(p, 'get').ok).toBe(true)
    expect(parse(p, 'Get').ok).toBe(true)
    expect(parse(p, 'gxt').ok).toBe(false)
  })

  it('reports correct span at offset', () => {
    const p = lit('world')
    const r = p.parse('hello world', 6, { trackLines: false })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.span).toEqual({ start: 6, end: 11 })
  })
})
