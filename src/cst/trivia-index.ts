import type { Span } from '../types.ts'

/** One captured trivia token (a whitespace run or a comment) with its source span. */
export type TriviaToken = { readonly value: string; readonly span: Span }

/**
 * Before/after offset index of captured trivia. Built from a tree's rawChildren
 * (trivia is only present there when the grammar enables `_captureTrivia`).
 *
 *   index.before.get(node.span.start)  // trivia immediately before a node
 *   index.after.get(node.span.end)     // trivia immediately after a node
 *
 * A given trivia run is registered under BOTH the following item's start
 * (`before`) and the preceding item's end (`after`), so either lookup finds it.
 */
export type TriviaIndex = {
  readonly before: Map<number, TriviaToken[]>
  readonly after: Map<number, TriviaToken[]>
}

type RawChild = { readonly _tag: string; readonly value?: string; readonly span?: Span }
type WithChildren = { readonly children?: ReadonlyArray<{ readonly _tag: string }> }

function spanOf(c: RawChild): Span | undefined {
  const s = (c as { span?: Span }).span
  return s && typeof s.start === 'number' ? s : undefined
}

function merge(map: Map<number, TriviaToken[]>, key: number, run: TriviaToken[]): void {
  if (run.length === 0) return
  const existing = map.get(key)
  if (existing) existing.push(...run)
  else map.set(key, [...run])
}

/**
 * Walk a CST/AST node tree (anything exposing `children` whose items carry
 * `_tag`/`span`, with trivia items tagged `'trivia'`) and build a before/after
 * trivia index. Generic over the node type — formatters, LSPs, and codemods all
 * need this, and Parseman already owns trivia capture.
 */
export function buildTriviaIndex(root: unknown): TriviaIndex {
  const before = new Map<number, TriviaToken[]>()
  const after = new Map<number, TriviaToken[]>()

  const visit = (node: WithChildren): void => {
    const raw = node.children as ReadonlyArray<RawChild> | undefined
    if (!raw) return
    let prevEnd: number | undefined
    let i = 0
    while (i < raw.length) {
      const c = raw[i]!
      if (c._tag === 'trivia') {
        const run: TriviaToken[] = []
        while (i < raw.length && raw[i]!._tag === 'trivia') {
          const t = raw[i]!
          const sp = spanOf(t)
          if (sp && sp.end > sp.start) run.push({ value: t.value ?? '', span: sp })
          i++
        }
        const next = i < raw.length ? spanOf(raw[i]!) : undefined
        if (next) merge(before, next.start, run)
        if (prevEnd !== undefined) merge(after, prevEnd, run)
        continue
      }
      const sp = spanOf(c)
      if (sp) prevEnd = sp.end
      if (c._tag === 'node') visit(c as unknown as WithChildren)
      i++
    }
  }

  if (root && typeof root === 'object') visit(root as WithChildren)
  return { before, after }
}
