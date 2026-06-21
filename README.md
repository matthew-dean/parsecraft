# parsecraft

Parser combinators that compile to optimized JavaScript.

Write parsers in a familiar combinator style. Use them directly as an interpreter, or import with `{ type: 'macro' }` and the bundler plugin inlines each parser as a hand-crafted function — `charCodeAt` dispatch, `while` loops, zero allocation on failed paths. Both modes produce identical results.

## Install

```bash
npm install parsecraft
# or
pnpm add parsecraft
```

## Interpreter mode

No build step required — works anywhere.

```ts
import { literal, sequence, choice, regex, transform, parse } from 'parsecraft'

const method = choice(literal('GET'), literal('POST'), literal('PUT'), literal('DELETE'))

const requestLine = transform(
  sequence(method, literal(' '), regex(/[^\s]+/), literal(' HTTP/'), regex(/1\.[01]/)),
  ([verb, , target, , version]) => ({ verb, target, version })
)

const result = parse(requestLine, 'GET /api/v1 HTTP/1.1')
// { ok: true, value: { verb: 'GET', target: '/api/v1', version: '1.1' }, span: ... }
```

## Macro mode (recommended for production)

Add the plugin to your bundler:

```ts
// vite.config.ts
import parsecraft from 'parsecraft/plugin'
export default { plugins: [parsecraft()] }

// rollup.config.js
import parsecraft from 'parsecraft/plugin'
export default { plugins: [parsecraft.rollup()] }

// webpack.config.js
const parsecraft = require('parsecraft/plugin')
module.exports = { plugins: [parsecraft.webpack()] }
```

Then just add `with { type: 'macro' }` to the import — no other changes:

```ts
import { literal, sequence, choice, regex, transform } from 'parsecraft' with { type: 'macro' }

// Same combinator code — the plugin evaluates it at build time and
// replaces each variable with an optimized inline function.
const method = choice(literal('GET'), literal('POST'), literal('PUT'), literal('DELETE'))

const requestLine = transform(
  sequence(method, literal(' '), regex(/[^\s]+/), literal(' HTTP/'), regex(/1\.[01]/)),
  ([verb, , target, , version]) => ({ verb, target, version })
)
```

The `parsecraft` import disappears entirely from the output. Each parser variable becomes a self-contained function expression.

Parser variables that reference user closures (like `transform()` with an arrow function) keep their runtime form — only pure combinator trees are inlined.

## Combinators

| Combinator | Description |
|---|---|
| `literal(value, opts?)` | Match a literal string. `opts.caseInsensitive` uses `Intl.Collator`. |
| `regex(pattern)` | Match a regex at the current position. Patterns pass through `regexp-tree` optimizer. |
| `sequence(...parsers)` | Match all parsers in order; returns a tuple `[v1, v2, ...]`. |
| `choice(...parsers)` | Try alternatives in order. Disjoint first characters → O(1) dispatch. |
| `many(parser)` | Zero or more repetitions; compiles to a `while` loop. |
| `oneOrMore(parser)` | One or more; fails if no match at all. |
| `optional(parser)` | Zero or one; returns `null` if not matched. |
| `sepBy(parser, sep)` | Zero or more `parser` separated by `sep`. |
| `transform(parser, fn)` | Transform the matched value with `fn(value, span)`. |
| `skip(main, skipped)` | Match `main`, then optionally skip `skipped`. Returns `main`'s value. |
| `trivia(parser)` | Mark a parser as trivia. Used by `grammar()` for auto-skipping. |
| `grammar(opts, root)` | Set grammar-wide options (`trivia`, `trackLines`) on a root parser. |

## Trivia (whitespace / comment skipping)

```ts
import { literal, regex, transform, trivia, grammar, sepBy, parse } from 'parsecraft'

const ws = trivia(regex(/\s+/))
const word = regex(/[a-z]+/)

const list = grammar(
  { trivia: ws },
  sepBy(word, literal(','))
)

parse(list, 'foo ,  bar , baz')
// { ok: true, value: ['foo', 'bar', 'baz'], ... }
```

When `trivia` is set, `sequence()` automatically skips trivia between its terms.

## Line / column tracking

```ts
import { literal, sequence, parse } from 'parsecraft'

const p = sequence(literal('hello'), literal('\n'), literal('world'))
const result = parse(p, 'hello\nworld', { trackLines: true })

if (result.ok) {
  result.span.startLine    // 1
  result.span.startColumn  // 1
  result.span.endLine      // 2
  result.span.endColumn    // 6
}
```

Line/column lookup is O(log n) via binary search on a precomputed newline index.
You can also call `buildLineIndex` + `annotateSpan` manually for more control.

## compile()

Call `compile()` directly to get an optimized parser at runtime — the same code the macro plugin inlines at build time:

```ts
import { choice, literal, compile } from 'parsecraft'

const parser = choice(literal('yes'), literal('no'))
const compiled = compile(parser)

compiled.parse('yes')          // { ok: true, value: 'yes', span: { start: 0, end: 3 } }
compiled.source                // generated JS source string
compiled.inlineExpression      // self-contained expression (used internally by the plugin)
```

## ParseResult

```ts
type ParseOk<T> = {
  ok: true
  value: T
  span: Span
}

type ParseFail = {
  ok: false
  expected: string[]   // what was expected at the failure point
  span: Span
}

type Span = {
  start: number          // byte offset, inclusive
  end: number            // byte offset, exclusive
  startLine?: number     // 1-based; populated when trackLines: true
  startColumn?: number   // 1-based
  endLine?: number
  endColumn?: number
}
```

## Choice optimization

`choice()` statically analyzes the first-character set of each alternative. When they're pairwise disjoint, it compiles to a single `codePointAt` dispatch — no backtracking, no sequential tries:

```ts
// Compiles to: if (code === 71 /*G*/) { ...GET... }
//              else if (code === 80 /*P*/) { ...POST... }
//              else if (code === 68 /*D*/) { ...DELETE... }
//              else return { ok: false, ... }
const method = choice(literal('GET'), literal('POST'), literal('DELETE'))
```

When alternatives share a first character, it tries each in order with IIFE-wrapped early returns.

## Developing

```bash
pnpm install
pnpm test          # Vitest suite (interpreter + compiler parity)
pnpm typecheck     # TypeScript 7
pnpm build         # ESM + CJS + .d.ts into dist/
```

## License

MIT
