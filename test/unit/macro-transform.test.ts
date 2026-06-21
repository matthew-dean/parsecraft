import { describe, it, expect } from 'vitest'
import { transformMacro } from '../../src/plugin/index.ts'

function transform(code: string) {
  return transformMacro(code, 'test.ts', new Set(['parsecraft']))
}

describe('transformMacro — import detection', () => {
  it('returns null for files without parsecraft', () => {
    expect(transform(`const x = 1`)).toBeNull()
  })

  it('returns null for regular (non-macro) parsecraft imports', () => {
    expect(transform(`import { lit } from 'parsecraft'`)).toBeNull()
  })

  it('detects with { type: "macro" } syntax', () => {
    const code = `
import { lit } from 'parsecraft' with { type: 'macro' }
const greeting = lit('hello')
`.trim()
    const result = transform(code)
    expect(result).not.toBeNull()
  })
})

describe('transformMacro — lit inlining', () => {
  it('inlines a simple lit() call', () => {
    const code = `
import { lit } from 'parsecraft' with { type: 'macro' }
const greeting = lit('hello')
`.trim()
    const result = transform(code)!
    // The import should be gone
    expect(result.code).not.toContain("from 'parsecraft'")
    // The declaration should be replaced with an inline function
    expect(result.code).toContain('const greeting =')
    expect(result.code).toContain('function(input')
    // Should check charCodeAt for 'h' (104)
    expect(result.code).toContain('104')
  })

  it('inlines a long lit() (>4 chars uses slice)', () => {
    const code = `
import { lit } from 'parsecraft' with { type: 'macro' }
const kw = lit('Authorization')
`.trim()
    const result = transform(code)!
    expect(result.code).toContain('"Authorization"')
    expect(result.code).not.toContain("from 'parsecraft'")
  })

  it('inlines case-insensitive lit', () => {
    const code = `
import { lit } from 'parsecraft' with { type: 'macro' }
const method = lit('GET', { caseInsensitive: true })
`.trim()
    const result = transform(code)!
    expect(result.code).toContain('_collator')
    expect(result.code).not.toContain("from 'parsecraft'")
  })
})

describe('transformMacro — choice inlining', () => {
  it('inlines a disjoint choice', () => {
    const code = `
import { lit, choice } from 'parsecraft' with { type: 'macro' }
const method = choice(lit('GET'), lit('POST'), lit('DELETE'))
`.trim()
    const result = transform(code)!
    expect(result.code).not.toContain("from 'parsecraft'")
    // Should have codePointAt dispatch
    expect(result.code).toContain('codePointAt')
  })
})

describe('transformMacro — seq inlining', () => {
  it('inlines seq of lits', () => {
    const code = `
import { lit, seq } from 'parsecraft' with { type: 'macro' }
const pair = seq(lit('foo'), lit('bar'))
`.trim()
    const result = transform(code)!
    expect(result.code).not.toContain("from 'parsecraft'")
    expect(result.code).toContain('const pair =')
  })
})

describe('transformMacro — cross-declaration references', () => {
  it('inlines a parser that references a previously inlined parser', () => {
    const code = `
import { lit, seq, choice, regex } from 'parsecraft' with { type: 'macro' }
const method = choice(lit('GET'), lit('POST'), lit('PUT'))
const sp = lit(' ')
const target = regex(/[^\\s]+/)
const requestLine = seq(method, sp, target)
`.trim()
    const result = transform(code)!
    expect(result.code).not.toContain("from 'parsecraft'")
    expect(result.code).toContain('const method =')
    expect(result.code).toContain('const requestLine =')
  })
})

describe('transformMacro — non-inlinable declarations', () => {
  it('leaves map() declarations as regular runtime calls', () => {
    const code = `
import { lit, map } from 'parsecraft' with { type: 'macro' }
const upper = map(lit('hello'), s => s.toUpperCase())
`.trim()
    const result = transform(code)
    // map with user fn can't be inlined — import kept, decl kept as-is
    if (result !== null) {
      // If something was transformed, it shouldn't have removed all of parsecraft
      // The map call itself remains (only inlinable declarations are replaced)
      expect(result.code).toContain('map(')
    }
  })
})

describe('transformMacro — source maps', () => {
  it('returns a source map', () => {
    const code = `
import { lit } from 'parsecraft' with { type: 'macro' }
const x = lit('x')
`.trim()
    const result = transform(code)!
    expect(result.map).toBeDefined()
  })
})
