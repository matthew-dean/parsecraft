import type { Combinator } from '../types.ts';
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
export declare function completionsAt(parser: Combinator<unknown>, input: string, offset: number): string[];
