# Perf notes from the jess CSS/Less grammars

Findings from profiling the macro-compiled jess CSS parser (`parseCssFn`) on
bootstrap4.css (~152 KB) and optimizing the grammars. These are **library-level**
opportunities in Parséman that the grammar author can't reach — they'd help every
node()-based grammar without affecting downstream extensibility.

## Where compiled parse time goes (bootstrap4.css)

| Bucket | ~% | Notes |
|---|---|---|
| Grammar rule functions (`_pf*`) | ~47% | combinator dispatch + per-`node()` machinery |
| jess node construction | ~23% | building the final AST nodes (grammar can't avoid) |
| **Trivia capture (`_tc*`)** | **~21%** | see #2 — currently allocates per-token objects nobody reads |
| GC / other | ~9% | |

The grammar-side wins already landed (collapsing fixed token shapes into single
regexes, parsing a leading ident once instead of parse-then-backtrack) only move
the `_pf` bucket a little, because the dominant grammar cost is structural
`node()` overhead, not the rule logic. Hence the two asks below.

## 1. `node()` collapse-to-single-child overhead (biggest lever)

Deeply-nested rules that usually collapse to one child pay full machinery on every
invocation. Example from the CSS grammar: a simple selector `.btn` parses through
`SelectorList → ComplexSelector → CompoundSelector`, three `node()` rules that each:

- allocate `children[]` and `rawChildren[]`,
- build a spread `innerCtx` (`{ ...ctx, _cstChildren, _cstLeaves, _cstRawChildren }`),
- run capture,
- call the build fn — which returns the single inner child (collapse).

For thousands of simple selectors that's almost pure allocation. Worth trying, in
the interpreter (`node()` combinator) and the compiler (`emit` for the `node` def):

- **Lazy child-array allocation** — don't allocate `children` / `rawChildren`
  until the first leaf/node is actually pushed. Most collapsing rules push one.
- **innerCtx reuse via save/restore** — mutate a single reused ctx and restore the
  saved collectors after the rule, instead of allocating a new spread object per
  `node()` invocation.
- **Single-child fast path** — when a `node()` rule matched exactly one captured
  child, hand it to `build` without the array wrappers.

## 2. Log-only trivia capture when `_triviaLog` is set

The compiled trivia-capture function (`_tc0`, ~21%) pushes each whitespace/comment
run into `_ctx._cstRawChildren` as a `{ _tag: 'trivia', … }` object **and** logs
`[start, end]` into `_ctx._triviaLog`. The jess CSS/Less builders never read the
rawChildren trivia entries — they reconstruct trivia from `_triviaLog` plus
source-gap inspection. So the per-token object push is pure waste for these grammars.

The interpreter's `scanTrivia` already early-returns in "log mode" when
`ctx._triviaLog !== undefined` (no rawChildren capture). The **compiled**
`ensureTriviaCaptureFn` output does not — it always captures objects, then logs.

Suggested fix: in the generated trivia function, when `_ctx._triviaLog !== undefined`,
take a log-only path (scan + push offsets, **skip** the rawChildren object push),
mirroring the interpreter. Grammars that don't set `_triviaLog` keep the current
capturing behavior, so no contract change.

## 3. First-char gating for non-disjoint choices sharing a prefix

The CSS value choice (`Dimension | Num | Color | Url | Call | … | anyValue`) and the
`Call` vs bare-ident overlap can't dispatch O(1) by first char because arms share
prefixes (numeric, ident). The grammar-side fix was to merge the overlapping arms
(parse the shared prefix once). A library improvement to `autoNot` / first-char
classification for common-prefix `choice` arms would generalize this so grammar
authors don't have to hand-merge.

---

Context: the perf benchmark `packages/css-parser/test/perf.test.ts` (in the jess
repo) now measures `parseCssFn` (compiled). Compiled ~34 ms vs legacy Chevrotain
~39 ms vs interpreted class parser ~42 ms.
