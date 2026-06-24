import { describe, it, expect } from 'vitest'
import { Parser, sequence, regex, type Refs, type Span, buildTriviaIndex } from '../../src/index.ts'
import type { CSTLeaf, CSTError } from '../../src/index.ts'

// A tiny CST-style node retaining rawChildren, mirroring how a real grammar
// (with _captureTrivia) keeps trivia on each node.
type RichNode = { _tag: 'node'; type: string; span: Span; state: unknown; children: unknown[] }

class PairGrammar extends Parser<RichNode> {
  ident = regex(/[a-z]+/)
  Ident = (g: Refs<PairGrammar>) => g.ident
  Pair = (g: Refs<PairGrammar>) => sequence(g.Ident, g.Ident)
  protected override _trivia = regex(/[ \t\n]+|\/\*[^]*?\*\//)
  protected override _captureTrivia = true
  protected buildNode(type: string, span: Span, children: ReadonlyArray<RichNode | CSTLeaf | CSTError>, state: unknown, rawChildren: ReadonlyArray<{ _tag: string }>): RichNode {
    return { _tag: 'node', type, span, state, children: [...rawChildren] }
  }
}

describe('buildTriviaIndex', () => {
  it('indexes trivia between two items by surrounding offsets', () => {
    const g = new PairGrammar()
    const doc = g.parse('Pair', 'foo   bar')
    expect(doc.errors).toHaveLength(0)
    const index = buildTriviaIndex(doc.tree)
    // 'bar' starts at offset 6; the whitespace run before it is registered there.
    const before = index.before.get(6)
    expect(before?.map(t => t.value)).toEqual(['   '])
    // 'foo' ends at offset 3; the same run is registered after it.
    const after = index.after.get(3)
    expect(after?.map(t => t.value)).toEqual(['   '])
  })

  it('returns empty maps for an adjacent (no-trivia) parse', () => {
    const g = new PairGrammar()
    const doc = g.parse('Pair', 'foobar')
    const index = buildTriviaIndex(doc.tree)
    expect(index.before.size).toBe(0)
    expect(index.after.size).toBe(0)
  })

  it('captures document-boundary (leading + trailing/pre-EOF) trivia via opts', () => {
    // A synthetic root spanning [3, 6] of the input, with leading and trailing
    // trivia a repeating root would have rolled back.
    const root = { _tag: 'node', type: 'Root', span: { start: 3, end: 6 }, state: null, children: [] }
    const input = '   foo /*x*/'   // 0..2 leading ws, 3..5 "foo", 6.. trailing
    const trivia = /[ \t\n\r\f]+|\/\*(?:[^*]|\*(?!\/))*\*\//
    const index = buildTriviaIndex(root, { input, trivia })
    expect(index.before.get(3)?.map(t => t.value)).toEqual(['   '])
    expect(index.after.get(6)?.map(t => t.value)).toEqual([' ', '/*x*/'])
  })
})
