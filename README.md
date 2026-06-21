# parsecraft

Compile-time parser combinators for TypeScript. Write parsers in a familiar combinator style; parsecraft compiles them into optimized, allocation-efficient JavaScript at build time.

```ts
import { seq, choice, lit, regex, many, map, compile } from 'parsecraft'

const method = choice(lit('GET'), lit('POST'), lit('PUT'), lit('DELETE'))
const requestLine = map(
  seq(method, lit(' '), regex(/[^\s]+/), lit(' HTTP/'), regex(/1\.[01]/)),
  ([verb, , target, , version]) => ({ verb, target, version })
)

// Runtime interpreter — always available, useful for tests
import { parse } from 'parsecraft'
const result = parse(requestLine, 'GET /api/v1 HTTP/1.1')

// Compiled — optimized JS emitted at build time (or via compile() at runtime)
const compiled = compile(requestLine)
compiled.parse('POST /api/v2 HTTP/1.0')
```

## Features

- **Disjoint-first-set dispatch** — `choice()` analyzes the first character of each alternative. When they don't overlap, it dispatches without backtracking.
- **Optimized literal matching** — `lit()` emits `charCodeAt` comparisons for strings ≤ 4 chars; `slice` comparison for longer ones.
- **Loop compilation** — `many()` / `many1()` compile to `while` loops.
- **Case-insensitive literals** — via a cached `Intl.Collator` with `sensitivity: 'accent'`.
- **Regex optimization** — patterns pass through `regexp-tree`'s optimizer before use.
- **First-set extraction** — regexes are analyzed statically to determine what characters can start them, enabling disjoint dispatch in `choice`.
- **Line/column tracking** — `buildLineIndex` + `annotateSpan` give O(log n) offset→line/col lookup via binary search on a precomputed newline array. Only parsers that `canMatchNewline` pay any cost.
- **Trivia (whitespace/comments)** — `grammar({ trivia: skip(regex(/\s+/)) }, root)` auto-skips whitespace between `seq` terms.

## Installation

```bash
npm install parsecraft
# or
pnpm add parsecraft
```

Requires **TypeScript 5.7+** (TypeScript 7 RC recommended).

## Combinators

| Combinator | Description |
|---|---|
| `lit(value, opts?)` | Match a literal string. `opts.caseInsensitive` uses `Intl.Collator`. |
| `regex(pattern, flags?)` | Match a regex anchored at the current position. |
| `seq(...parsers)` | Match all parsers in order. Returns a tuple. |
| `choice(...parsers)` | Try alternatives in order. Uses first-set dispatch when disjoint. |
| `many(parser)` | Zero or more. Compiles to a `while` loop. |
| `many1(parser)` | One or more. Fails if the first match fails. |
| `optional(parser)` | Zero or one. Always succeeds; value is `null` if not matched. |
| `sepBy(parser, sep)` | Zero or more occurrences of `parser` separated by `sep`. |
| `map(parser, fn)` | Transform the result value. |
| `skip(main, skipped)` | Match `main`, then optionally consume `skipped`. |
| `trivia(parser)` | Mark a parser as trivia (used by `grammar`). |
| `grammar(opts, root)` | Set grammar-wide options: `trivia` and `trackLines`. |

## Compile

```ts
import { compile } from 'parsecraft'

const compiled = compile(myParser)
const result = compiled.parse('input string')
// result: ParseResult<T>
// compiled.source: the generated JS (for inspection)
```

`compile()` works at both runtime and build time. The unplugin (below) moves the `compile()` call to your bundler so the generated code ships as static JS — no `new Function()` at runtime.

## Line/column tracking

```ts
import { buildLineIndex, annotateSpan, parse } from 'parsecraft'

const input = 'line one\nline two\nline three'
const idx = buildLineIndex(input)

const result = parse(myParser, input)
if (result.ok) {
  const annotated = annotateSpan(result.span, idx)
  // annotated.startLine, startColumn, endLine, endColumn
}
```

## Bundler plugin

Add to your bundler config so parsecraft can analyze and AOT-compile your parsers:

```ts
// vite.config.ts
import parsecraft from 'parsecraft/plugin'

export default {
  plugins: [parsecraft()],
}
```

```ts
// rollup.config.js
import parsecraft from 'parsecraft/plugin'
export default { plugins: [parsecraft.rollup()] }
```

```ts
// webpack.config.js
const parsecraft = require('parsecraft/plugin')
module.exports = { plugins: [parsecraft.webpack()] }
```

The plugin currently validates parsecraft imports and prepares for phase-2 AOT rewriting. Full AST-level `compile()` call inlining is the next release.

## ParseResult

```ts
type ParseOk<T> = {
  ok: true
  value: T
  span: Span
}

type ParseFail = {
  ok: false
  expected: string[]  // what was expected at the failure point
  span: Span
}

type Span = {
  start: number        // byte offset
  end: number
  startLine?: number   // set by annotateSpan()
  startColumn?: number
  endLine?: number
  endColumn?: number
}
```

## Developing

```bash
pnpm install
pnpm test          # run tests
pnpm typecheck     # type-check with TypeScript 7
pnpm build         # emit dist/ (ESM + CJS + declarations)
```

## License

MIT
