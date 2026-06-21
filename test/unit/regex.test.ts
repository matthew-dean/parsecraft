import { describe, it, expect } from 'vitest'
import { regex, parse } from '../../src/index.ts'

describe('regex', () => {
  it('matches a simple pattern', () => {
    const r = parse(regex(/[0-9]+/), '123abc')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value).toBe('123')
      expect(r.span).toEqual({ start: 0, end: 3 })
    }
  })

  it('fails when pattern does not match at position', () => {
    const r = parse(regex(/[0-9]+/), 'abc')
    expect(r.ok).toBe(false)
  })

  it('anchors match to current position', () => {
    const p = regex(/[a-z]+/)
    const r = p.parse('123abc', 3, { trackLines: false })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('abc')
  })

  it('computes firstSet for digit class', () => {
    const p = regex(/[0-9]+/)
    expect(p._meta.firstSet).toMatchObject({ kind: 'ranges' })
  })

  it('detects canMatchNewline for \\n', () => {
    const p = regex(/[\s\S]+/)
    expect(p._meta.canMatchNewline).toBe(true)
  })

  it('does not flag canMatchNewline for digit-only', () => {
    const p = regex(/[0-9]+/)
    expect(p._meta.canMatchNewline).toBe(false)
  })
})
