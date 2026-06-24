import type { Combinator } from '../types.ts';
/**
 * Negative lookahead. Succeeds (consuming nothing) when `parser` fails;
 * fails when `parser` succeeds.
 *
 * The standard way to match a keyword without also matching the prefix
 * of a longer identifier:
 *
 *   const kwTrue = sequence(literal('true'), not(regex(/\w/)))
 *   // matches "true" in "true && x" but NOT in "trueish" or "trueness"
 */
export declare function not(parser: Combinator<unknown>): Combinator<null>;
