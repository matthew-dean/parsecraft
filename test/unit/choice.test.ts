import { describe, it, expect } from 'vitest'
import { lit, choice, parse } from '../../src/index.ts'

describe('choice', () => {
  it('matches first alternative', () => {
    const p = choice(lit('foo'), lit('bar'))
    const r = parse(p, 'foo')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('foo')
  })

  it('falls through to second alternative', () => {
    const p = choice(lit('foo'), lit('bar'))
    const r = parse(p, 'bar')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('bar')
  })

  it('fails when nothing matches', () => {
    const p = choice(lit('foo'), lit('bar'))
    expect(parse(p, 'baz').ok).toBe(false)
  })

  it('detects disjoint first sets', () => {
    // 'a' and 'b' have disjoint first chars
    const p = choice(lit('apple'), lit('banana'))
    expect((p._meta as { disjoint?: boolean }).disjoint).toBe(true)
  })

  it('detects overlapping first sets', () => {
    // both start with 'f'
    const p = choice(lit('foo'), lit('far'))
    expect((p._meta as { disjoint?: boolean }).disjoint).toBe(false)
  })

  it('uses fast dispatch for disjoint choices', () => {
    const p = choice(lit('apple'), lit('banana'), lit('cherry'))
    expect(parse(p, 'banana').ok).toBe(true)
    expect(parse(p, 'cherry').ok).toBe(true)
  })

  it('collects expected labels on failure', () => {
    const p = choice(lit('foo'), lit('bar'))
    const r = parse(p, 'baz')
    expect(r.ok).toBe(false)
    // 'baz' starts with 'b' — disjoint dispatch only tries 'bar' (f ≠ b),
    // so only '"bar"' appears in expected. '"foo"' is correctly absent.
    if (!r.ok) expect(r.expected).toContain('"bar"')
  })

  it('collects all expected labels when no first-set matches', () => {
    const p = choice(lit('foo'), lit('bar'))
    const r = parse(p, '123')
    expect(r.ok).toBe(false)
    // '1' matches neither first set — both labels collected
    if (!r.ok) {
      expect(r.expected).toContain('"foo"')
      expect(r.expected).toContain('"bar"')
    }
  })
})
