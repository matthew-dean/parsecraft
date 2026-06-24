import type { Span } from '../types.ts';
/**
 * Precomputed index of newline positions for O(log n) offset→line/col lookup.
 * lineStarts[i] is the byte offset of the first character on line i+1.
 */
export type LineIndex = {
    lineStarts: number[];
};
export declare function buildLineIndex(input: string): LineIndex;
export declare function offsetToLineCol(index: LineIndex, offset: number): {
    line: number;
    col: number;
};
/** Fills startLine/startColumn/endLine/endColumn on a span in-place. */
export declare function annotateSpan(span: Span, index: LineIndex): Span;
