import type { Combinator } from '../types.ts';
/**
 * Negative lookahead. Succeeds (consuming nothing) when `combinator` fails;
 * fails when `combinator` succeeds.
 *
 * The standard way to match a keyword without also matching the prefix
 * of a longer identifier:
 *
 *   const kwTrue = sequence(literal('true'), not(regex(/\w/)))
 *   // matches "true" in "true && x" but NOT in "trueish" or "trueness"
 */
export declare function not(combinator: Combinator<unknown>): Combinator<null>;
