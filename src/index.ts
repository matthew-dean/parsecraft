export type { Parser, ParseResult, ParseOk, ParseFail, ParseContext, Span, ParserMeta, FirstSet, CharRange, ParserDef } from './types.ts'

export { literal } from './combinators/literal.ts'
export type { LiteralOptions } from './combinators/literal.ts'

export { regex } from './combinators/regex.ts'

export { sequence } from './combinators/sequence.ts'
export { choice } from './combinators/choice.ts'
export { many, oneOrMore, optional, sepBy } from './combinators/repeat.ts'
export { transform, skip, trivia } from './combinators/map.ts'
export { grammar, parse } from './combinators/grammar.ts'

export { compile } from './compiler/codegen.ts'
export type { CompiledParser } from './compiler/codegen.ts'

export { buildLineIndex, offsetToLineCol, annotateSpan } from './compiler/line-index.ts'
export type { LineIndex } from './compiler/line-index.ts'
