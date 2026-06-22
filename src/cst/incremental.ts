import type { ParseContext, ParseFail } from '../types.ts'
import type { Parser, RuleKeys } from './grammar.ts'
import type { CSTLeaf, CSTError, NodeLike } from './types.ts'

// ---------------------------------------------------------------------------
// ParseDoc
// ---------------------------------------------------------------------------

/**
 * The result of Parser.parse() — holds the current tree and supports
 * incremental re-parsing via edit().
 *
 *   const doc = css.parse('Stylesheet', src)
 *   doc.tree    // CSTNode (or your N), null if parse failed
 *   doc.errors  // ParseFail[], empty on success
 *   doc.input   // the source string that produced this tree
 *
 *   const doc2 = doc.edit(newSrc, changeStart, changeEnd)
 */
export interface ParseDoc<N extends NodeLike = NodeLike> {
  readonly tree: N | null
  readonly errors: ParseFail[]
  readonly input: string
  edit(newInput: string, editStart: number, editEnd: number): ParseDoc<N>
}

// ---------------------------------------------------------------------------
// Tree navigation helpers
// ---------------------------------------------------------------------------

type FoundNode = { node: NodeLike; path: number[] }

function isNode(x: unknown): x is NodeLike {
  return typeof x === 'object' && x !== null && (x as { _tag?: string })._tag === 'node'
}

function findContaining(node: NodeLike, pos: number, path: number[] = []): FoundNode | null {
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]!
    if (!isNode(child)) continue
    if (child.span.start <= pos && pos < child.span.end) {
      return findContaining(child, pos, [...path, i]) ?? { node: child, path: [...path, i] }
    }
  }
  return null
}

function ancestorsAt(root: NodeLike, path: number[]): NodeLike[] {
  const ancestors: NodeLike[] = [root]
  let cur: NodeLike = root
  for (const idx of path.slice(0, -1)) {
    const child = cur.children[idx]
    if (!child || !isNode(child)) break
    ancestors.push(child)
    cur = child
  }
  return ancestors
}

type Rebuilder<N extends NodeLike> = {
  rebuild(node: N, children: ReadonlyArray<N | CSTLeaf | CSTError>): N
}

function replaceAtPath<N extends NodeLike>(
  grammar: Rebuilder<N>,
  root: N,
  path: number[],
  newNode: N,
): N {
  if (path.length === 0) return newNode
  const [idx, ...rest] = path as [number, ...number[]]
  const newChildren = [...root.children] as unknown[] as Array<N | CSTLeaf | CSTError>
  newChildren[idx] = rest.length === 0
    ? newNode
    : replaceAtPath(grammar, root.children[idx] as N, rest, newNode)
  return grammar.rebuild(root, newChildren)
}

// ---------------------------------------------------------------------------
// ParseDoc implementation
// ---------------------------------------------------------------------------

class ParseDocImpl<N extends NodeLike> implements ParseDoc<N> {
  constructor(
    private readonly _parser: Parser<N>,
    private readonly _ruleName: string,
    public readonly tree: N | null,
    public readonly errors: ParseFail[],
    public readonly input: string,
  ) {}

  edit(newInput: string, editStart: number, editEnd: number): ParseDoc<N> {
    if (!this.tree) return makeParseDoc(this._parser, this._ruleName, newInput)

    const delta = newInput.length - this.input.length
    const found = findContaining(this.tree, editStart)
    if (!found) return makeParseDoc(this._parser, this._ruleName, newInput)

    const ancestors = ancestorsAt(this.tree, found.path)
    const candidates: FoundNode[] = [found]
    const pathCopy = [...found.path]
    for (let i = ancestors.length - 2; i >= 0; i--) {
      pathCopy.pop()
      candidates.push({ node: ancestors[i + 1]!, path: [...pathCopy] })
    }

    for (const candidate of candidates) {
      const { node, path } = candidate
      const expectedEnd = node.span.end + delta
      const parser = this._parser.rule(node.type as RuleKeys<typeof this._parser>)
      const ctx: ParseContext = { trackLines: false, user: node.savedContext }
      const r = parser.parse(newInput, node.span.start, ctx)
      if (!r.ok) continue
      if (r.span.end === expectedEnd) {
        const newTree = replaceAtPath(this._parser, this.tree!, path, r.value)
        return new ParseDocImpl(this._parser, this._ruleName, newTree, [], newInput)
      }
    }

    return makeParseDoc(this._parser, this._ruleName, newInput)
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function makeParseDoc<N extends NodeLike>(
  parser: Parser<N>,
  ruleName: string,
  input: string,
): ParseDoc<N> {
  const ctx: ParseContext = { trackLines: false }
  const r = parser.rule(ruleName as RuleKeys<typeof parser>).parse(input, 0, ctx)
  if (r.ok) {
    return new ParseDocImpl(parser, ruleName, r.value, [], input)
  }
  return new ParseDocImpl(parser, ruleName, null, [{ ok: false, expected: r.expected, span: r.span }], input)
}
