import type { Combinator, ParseFail, ParseContext } from '../types.ts'

/**
 * Returns the set of expected tokens at the given cursor offset.
 * Useful for implementing IDE completions.
 *
 * Runs the parser on input truncated at `offset` with a probe that tracks the
 * highest-position failure seen, even when sepBy/many backtrack past the cursor.
 * Returns the expected tokens from that deepest failure.
 *
 * Returns an empty array when the input up to `offset` parses completely
 * with no failures at or before the cursor.
 *
 * The returned strings use the same labels as ParseFail.expected:
 * quoted literals like `"\"{\""` and regex patterns like `"/[0-9]+/"`.
 */
export function completionsAt(
  combinator: Combinator<unknown>,
  input: string,
  offset: number,
): string[] {
  const probe: { offset: number; best: ParseFail | null } = { offset, best: null }
  const ctx: ParseContext = { trackLines: false, _probe: probe }
  const result = combinator.parse(input.slice(0, offset), 0, ctx)

  // If the parser consumed everything up to offset successfully, there is nothing
  // to complete — the input is already valid at this position.
  if (result.ok) return []

  // Use whichever failure (probe or top-level) sits at the deeper position.
  const best = deeperFail(probe.best, result)
  return best?.expected ?? []
}

function deeperFail(a: ParseFail | null, b: ParseFail | null): ParseFail | null {
  if (!a) return b
  if (!b) return a
  return a.span.start >= b.span.start ? a : b
}
