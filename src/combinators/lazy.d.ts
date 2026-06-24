import type { Combinator } from '../types.ts';
/**
 * Defers parser construction until first use — necessary for recursive grammars
 * where a parser references itself (e.g. JSON value contains JSON arrays/objects).
 *
 * The thunk is called once and the result cached. First-set metadata is
 * approximated as 'any' since it's unknown at construction time; this means
 * lazy parsers inside choice() won't get O(1) disjoint dispatch, but they
 * will work correctly.
 *
 * The compiler treats lazy as a runtime fallback (can't inline recursive parsers).
 */
export declare function lazy<T>(thunk: () => Combinator<T>): Combinator<T>;
