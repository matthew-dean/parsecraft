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
 * Options for trailing/leading trivia at the document boundary. A repeating root
 * (e.g. `many()`) rolls back the trivia after its last item — it's "trailing" and
 * belongs to the enclosing context, which at the document root is the document
 * itself. Pass `{ input, trivia }` to re-scan and register that boundary trivia,
 * so a round-trippable trivia map isn't missing the run before EOF.
 */
export type TriviaIndexOptions = {
  /** The full source string. */
  input: string
  /**
   * A regex matching ONE trivia token (a whitespace run or a comment). Applied
   * repeatedly to tokenize the boundary trivia. Each match becomes one token, so
   * write it to match a maximal run, e.g.
   * `/[ \t\n\r\f]+|\/\*(?:[^*]|\*(?!\/))*\*\//`.
   */
  trivia: RegExp
}

/**
 * Walk a CST/AST node tree (anything exposing `children` whose items carry
 * `_tag`/`span`, with trivia items tagged `'trivia'`) and build a before/after
 * trivia index. Generic over the node type — formatters, LSPs, and codemods all
 * need this, and Parseman already owns trivia capture.
 *
 * With `opts`, also captures leading trivia (before the root's content) and
 * trailing trivia (after it, up to EOF) — the document boundaries a repeating
 * root rolls back.
 */
export function buildTriviaIndex(root: unknown, opts?: TriviaIndexOptions): TriviaIndex {
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

  // Document-boundary trivia: re-scan leading (offset 0) and trailing (root end
  // → EOF) trivia that a repeating root rolled back.
  if (opts) {
    const rootSpan = spanOf(root as RawChild)
    const re = new RegExp(opts.trivia.source, opts.trivia.flags.replace(/[gy]/g, '') + 'y')
    const scanFrom = (from: number): TriviaToken[] => {
      const run: TriviaToken[] = []
      let pos = from
      re.lastIndex = pos
      let m = re.exec(opts.input)
      while (m && m.index === pos && m[0].length > 0) {
        run.push({ value: m[0], span: { start: pos, end: pos + m[0].length } })
        pos += m[0].length
        re.lastIndex = pos
        m = re.exec(opts.input)
      }
      return run
    }

    // Leading: from 0 up to the root's content start (only when there's a gap).
    if (rootSpan && rootSpan.start > 0) {
      const lead = scanFrom(0)
      if (lead.length) merge(before, rootSpan.start, lead)
    }
    // Trailing: from the root's content end to EOF.
    const end = rootSpan ? rootSpan.end : 0
    if (end < opts.input.length) {
      const trail = scanFrom(end)
      if (trail.length) {
        merge(after, end, trail)
        merge(before, end + trail.reduce((n, t) => n + (t.span.end - t.span.start), 0), trail)
      }
    }
  }

  return { before, after }
}
