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

// ---------------------------------------------------------------------------
// Parser definition tree — carried on every Parser so the compiler can
// traverse the full combinator structure without re-parsing source.
// ---------------------------------------------------------------------------
export type ParserDef =
  | { tag: 'literal';   value: string; caseInsensitive: boolean }
  | { tag: 'regex';     source: string; flags: string; optimizedSource: string }
  | { tag: 'sequence';  parsers: Parser<unknown>[] }
  | { tag: 'choice';    parsers: Parser<unknown>[]; disjoint: boolean }
  | { tag: 'many';      parser: Parser<unknown>; min: 0 }
  | { tag: 'oneOrMore'; parser: Parser<unknown>; min: 1 }
  | { tag: 'optional';  parser: Parser<unknown> }
  | { tag: 'sepBy';     parser: Parser<unknown>; separator: Parser<unknown> }
  | { tag: 'transform'; parser: Parser<unknown>; fn: (v: unknown, span: { start: number; end: number }) => unknown }
  | { tag: 'skip';      main: Parser<unknown>; skipped: Parser<unknown> }
  | { tag: 'trivia';    parser: Parser<unknown> }
  | { tag: 'grammar';   parser: Parser<unknown>; triviaParser: Parser<unknown> | undefined; trackLines: boolean }
  | { tag: 'unknown' }

export type Parser<T> = {
  readonly _tag: string
  readonly _meta: ParserMeta
  readonly _def: ParserDef
  parse(input: string, pos: number, ctx: ParseContext): ParseResult<T>
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
