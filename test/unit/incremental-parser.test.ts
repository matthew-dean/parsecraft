import { describe, it, expect } from 'vitest'
import {
  literal, regex, sequence, choice, many, optional, sepBy,
  parse, withCtx, guard,
} from '../../src/index.ts'
import { Parser } from '../../src/index.ts'
import type { Refs } from '../../src/index.ts'
import type { CSTNode } from '../../src/index.ts'

// ---------------------------------------------------------------------------
// Simple grammar for all basic tests
// ---------------------------------------------------------------------------
class JsonLikeGrammar extends Parser {
  ws     = regex(/\s*/)
  digits = regex(/[0-9]+/)
  ident  = regex(/[a-zA-Z_]\w*/)
  Str    = sequence(literal('"'), regex(/[^"]*/), literal('"'))

  Num    = (g: Refs<JsonLikeGrammar>) => g.digits
  Id     = (g: Refs<JsonLikeGrammar>) => g.ident
  Value  = (g: Refs<JsonLikeGrammar>) => choice(g.Num, g.Str, g.Id)
  Pair   = (g: Refs<JsonLikeGrammar>) => sequence(g.Id, g.ws, literal(':'), g.ws, g.Value)
  pairs  = (g: Refs<JsonLikeGrammar>) => sepBy(g.Pair, sequence(g.ws, literal(','), g.ws))
  Object = (g: Refs<JsonLikeGrammar>) => sequence(literal('{'), g.ws, g.pairs, g.ws, literal('}'))
}

const g = new JsonLikeGrammar()

// ---------------------------------------------------------------------------
// Full parse
// ---------------------------------------------------------------------------
describe('ParseDoc — full parse', () => {
  it('parses a simple object', () => {
    const doc = g.parse('Object', '{a:1}')
    expect(doc.tree).not.toBeNull()
    expect(doc.tree!._tag).toBe('node')
    expect(doc.tree!.type).toBe('Object')
  })

  it('returns null tree and errors on invalid input', () => {
    const doc = g.parse('Object', '{invalid:')
    expect(doc.tree).toBeNull()
    expect(doc.errors.length).toBeGreaterThan(0)
  })

  it('carries the input string', () => {
    const doc = g.parse('Object', '{x:1}')
    expect(doc.input).toBe('{x:1}')
  })

  it('errors is empty on success', () => {
    const doc = g.parse('Object', '{x:1}')
    expect(doc.errors).toHaveLength(0)
  })

  it('parsed tree has Pair children', () => {
    const doc = g.parse('Object', '{a:1,b:2}')
    expect(doc.tree).not.toBeNull()
    const pairs = doc.tree!.children.filter(c => c._tag === 'node' && (c as CSTNode).type === 'Pair')
    expect(pairs.length).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Incremental edit
// ---------------------------------------------------------------------------
describe('ParseDoc — edit', () => {
  it('edit on failed parse falls back to full parse', () => {
    const doc = g.parse('Object', '').edit(0, 0, '{x:1}')
    expect(doc.tree).not.toBeNull()
    expect(doc.tree!.type).toBe('Object')
  })

  it('replacing a value returns a valid tree', () => {
    const doc = g.parse('Object', '{a:1}').edit(3, 4, '42')
    expect(doc.tree).not.toBeNull()
    expect(doc.tree!.type).toBe('Object')
  })

  it('carries updated input after edit', () => {
    const doc = g.parse('Object', '{a:1}').edit(3, 4, '42')
    expect(doc.input).toBe('{a:42}')
  })

  it('adding a pair to the object', () => {
    const doc = g.parse('Object', '{a:1}').edit(4, 4, ',b:2')
    expect(doc.tree).not.toBeNull()
    const pairs = doc.tree!.children.filter(c => c._tag === 'node' && (c as CSTNode).type === 'Pair')
    expect(pairs.length).toBe(2)
  })

  it('removing a pair from the object', () => {
    const doc = g.parse('Object', '{a:1,b:2}').edit(4, 8, '')
    expect(doc.tree).not.toBeNull()
    const pairs = doc.tree!.children.filter(c => c._tag === 'node' && (c as CSTNode).type === 'Pair')
    expect(pairs.length).toBe(1)
  })

  it('edit to invalid input returns null tree with errors', () => {
    const doc = g.parse('Object', '{a:1}').edit(3, 5, '')
    expect(doc.tree).toBeNull()
    expect(doc.errors.length).toBeGreaterThan(0)
  })

  it('successive edits chain correctly', () => {
    const doc = g.parse('Object', '{x:1}')
      .edit(4, 4, '0')
      .edit(5, 5, '0')
    expect(doc.tree).not.toBeNull()
    expect(doc.tree!.type).toBe('Object')
  })
})

// ---------------------------------------------------------------------------
// Immutable update
// ---------------------------------------------------------------------------
describe('ParseDoc — immutable tree', () => {
  it('edit does not mutate the original doc', () => {
    const doc1 = g.parse('Object', '{a:1}')
    const originalSpan = { ...doc1.tree!.span }
    const originalChildCount = doc1.tree!.children.length

    doc1.edit(3, 4, '42')

    expect(doc1.tree!.span).toEqual(originalSpan)
    expect(doc1.tree!.children.length).toBe(originalChildCount)
  })

  it('unaffected subtrees are shared (same object reference)', () => {
    const doc1 = g.parse('Object', '{a:1,b:2}')
    const firstPairBefore = doc1.tree!.children.find(
      c => c._tag === 'node' && (c as CSTNode).type === 'Pair'
    ) as CSTNode | undefined
    expect(firstPairBefore).toBeDefined()

    const doc2 = doc1.edit(7, 8, '99')
    const firstPairAfter = doc2.tree!.children.find(
      c => c._tag === 'node' && (c as CSTNode).type === 'Pair'
    ) as CSTNode | undefined
    expect(firstPairAfter).toBeDefined()
    expect(firstPairAfter).toBe(firstPairBefore)
  })
})

// ---------------------------------------------------------------------------
// Context-sensitive incremental parse
// ---------------------------------------------------------------------------
describe('ParseDoc — context-sensitive', () => {
  class LangGrammar extends Parser {
    ws = regex(/\s*/)

    Return  = (g: Refs<LangGrammar>) => sequence(
      guard((u: unknown) => (u as { inFn?: boolean } | undefined)?.inFn === true),
      literal('return'),
    )
    Expr    = regex(/[a-z]+/)
    Stmt    = (g: Refs<LangGrammar>) => choice(g.Return, g.Expr)
    Body    = (g: Refs<LangGrammar>) => withCtx({ inFn: true }, many(sequence(g.Stmt, g.ws)))
    Program = (g: Refs<LangGrammar>) => many(sequence(g.Body, g.ws))
  }

  const lang = new LangGrammar()

  it('incremental re-parse of a Body node uses saved inFn:true context', () => {
    const doc = lang.parse('Program', 'return ').edit(7, 7, 'return ')
    expect(doc.tree).not.toBeNull()
  })

  it('savedContext on Stmt node records inFn:true', () => {
    const doc = lang.parse('Program', 'return ')
    expect(doc.tree).not.toBeNull()

    function findNode(node: CSTNode, type: string): CSTNode | undefined {
      if (node.type === type) return node
      for (const c of node.children) {
        if (c._tag === 'node') {
          const found = findNode(c as CSTNode, type)
          if (found) return found
        }
      }
      return undefined
    }

    const stmt = findNode(doc.tree!, 'Stmt')
    expect(stmt).toBeDefined()
    expect((stmt!.savedContext as { inFn?: boolean } | undefined)?.inFn).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe('ParseDoc — edge cases', () => {
  it('edit at the very start of input', () => {
    const doc = g.parse('Object', '{a:1}').edit(1, 1, ' ')
    expect(doc.tree).not.toBeNull()
  })

  it('zero-length edit (pure insertion)', () => {
    const doc = g.parse('Object', '{a:1}').edit(2, 2, 'b')
    expect(doc.tree).not.toBeNull()
  })

  it('edit that deletes everything falls back gracefully', () => {
    const doc = g.parse('Object', '{a:1}').edit(0, 5, '')
    expect(doc.tree).toBeNull()
  })
})
