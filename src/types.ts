export type Span = {
  start: number
  end: number
  startLine?: number
  startColumn?: number
  endLine?: number
  endColumn?: number
}

export type ParseOk<T> = {
  ok: true
  value: T
  span: Span
  trivia?: Span[]
}

export type ParseFail = {
  ok: false
  expected: string[]
  span: Span
}

export type ParseResult<T> = ParseOk<T> | ParseFail

export type Parser<T> = {
  readonly _tag: string
  parse(input: string, pos: number, ctx: ParseContext): ParseResult<T>
  /** Static metadata used by the compiler */
  readonly _meta: ParserMeta
}

export type ParseContext = {
  trivia?: Parser<unknown>
  trackLines: boolean
}

export type ParserMeta = {
  /** Character codes / ranges that can start this parser (for choice dispatch) */
  firstSet: FirstSet
  /** Whether this parser can consume a newline character */
  canMatchNewline: boolean
  /** Whether this parser is marked as trivia (auto-skip) */
  isTrivia: boolean
  /** choice(): true when all alternative first sets are pairwise disjoint */
  disjoint?: boolean
}

/** A first set is either "any" (unknown/unbounded) or a list of char code ranges */
export type FirstSet =
  | { kind: 'any' }
  | { kind: 'ranges'; ranges: CharRange[] }
  | { kind: 'empty' }

export type CharRange = { lo: number; hi: number }
