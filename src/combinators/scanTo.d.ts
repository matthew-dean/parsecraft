import type { Combinator } from '../types.ts';
export type ScanToOptions = {
    /** Parsers that match "container" regions to skip over intact (balanced parens, strings, comments…) */
    skip?: Combinator<unknown>[];
    /**
     * If true, reaching EOF without finding the sentinel is a success — returns
     * everything consumed so far. Default false (fail at EOF).
     */
    orEOF?: boolean;
};
/**
 * Consume input up to (but not including) the sentinel, skipping over any
 * "hole" patterns in order so their contents are never mistaken for the sentinel.
 *
 * Returns the consumed text as a string. The sentinel is NOT consumed.
 * Fails if the sentinel is never found (unless orEOF is true).
 *
 *   const selector = scanTo(literal('{'), {
 *     skip: [cssComment, stringLit, balanced('(', ')'), balanced('[', ']')],
 *   })
 */
export declare function scanTo(sentinel: Combinator<unknown>, { skip, orEOF }?: ScanToOptions): Combinator<string>;
/**
 * Match a balanced open/close pair, skipping over any holes inside.
 * Returns the full matched text including delimiters.
 *
 *   const parenGroup = balanced('(', ')', { skip: [comment, stringLit] })
 */
export declare function balanced(open: string, close: string, options?: ScanToOptions): Combinator<string>;
