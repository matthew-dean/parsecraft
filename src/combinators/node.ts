import type { Combinator, ParseContext, ParseResult, ParserMeta } from '../types.ts'

/**
 * A CST/AST node rule. Runs `parser` while collecting its terminals (and, when
 * trivia capture is on, the trivia between them) into `children` / `rawChildren`
 * arrays, then calls `build(children, rawChildren, span)` to produce the node.
 *
 * This is the functional replacement for the class `Parser`'s capital-letter
 * rules + `buildNode`: capture is owned by the library (here and in the
 * compiler), so grammar authors don't hand-wrap terminals or reconstruct trivia.
 *
 *   - `children`    — structural items in source order: spanned CSTLeaf terminals
 *                     and sub-nodes (whatever `build` returned for inner nodes).
 *   - `rawChildren` — the same, plus CSTTrivia tokens for trivia consumed between
 *                     terms (only when the parse runs with `captureTrivia`).
 *
 * If `build` returns a non-node value (e.g. a bare string for a collapsed rule),
 * the parent records it as a spanned leaf so its source span is still recoverable.
 */
export type BuildNode<N> = (
  children: ReadonlyArray<unknown>,
  rawChildren: ReadonlyArray<unknown>,
  span: { start: number; end: number },
) => N

export function node<N>(type: string, parser: Combinator<unknown>, build: BuildNode<N>): Combinator<N> {
  const meta: ParserMeta = {
    firstSet: parser._meta.firstSet,
    canMatchNewline: parser._meta.canMatchNewline,
    isTrivia: false,
  }
  return {
    _tag: 'node',
    _meta: meta,
    _def: { tag: 'node', type, parser, build },
    parse(input: string, pos: number, ctx: ParseContext): ParseResult<N> {
      const children: unknown[] = []
      const rawChildren: unknown[] = []
      const innerCtx: ParseContext = {
        ...ctx,
        // A node() always records the trivia between its terms — the library owns
        // capture so grammar authors don't reconstruct it. (Matches the compiler.)
        captureTrivia: true,
        _cstChildren: children,
        _cstLeaves: children,
        _cstRawChildren: rawChildren,
      }
      const r = parser.parse(input, pos, innerCtx)
      if (!r.ok) return r

      const built = build(children, rawChildren, r.span)
      const isNodeLike = typeof built === 'object' && built !== null && (built as { _tag?: string })._tag === 'node'
      if (ctx._cstChildren) (ctx._cstChildren as unknown[]).push(built)
      if (ctx._cstRawChildren) {
        (ctx._cstRawChildren as unknown[]).push(
          isNodeLike ? built : { _tag: 'leaf', value: typeof built === 'string' ? built : '', span: r.span }
        )
      }
      return { ok: true, value: built, span: r.span }
    },
  }
}
