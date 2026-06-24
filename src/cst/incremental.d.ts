import type { Combinator, ParseFail } from '../types.ts';
import type { Parser } from './grammar.ts';
import type { NodeLike } from './types.ts';
/**
 * The result of Parser.parse() — holds the current tree and supports
 * incremental re-parsing via edit().
 *
 *   const doc = css.parse('Stylesheet', src)
 *   doc.tree    // CSTNode (or your N), null if parse failed
 *   doc.errors  // ParseFail[], empty on success
 *   doc.input   // the source string that produced this tree
 *
 *   const doc2 = doc.edit(changeStart, changeEnd, newText)  // "select from→to, type newText"
 */
export interface ParseDoc<N extends NodeLike = NodeLike> {
    readonly tree: N | null;
    readonly errors: ParseFail[];
    readonly input: string;
    /**
     * Incrementally re-parse after a text change.
     *
     * Think of it as "select from → to, replace with replacement": both `from`
     * and `to` are byte offsets in the OLD input. `replacement` is what fills
     * that range in the new text.
     *
     *   doc.edit(3, 7, 'hi')  →  old: "foo [XXXX] bar"   new: "foo hi bar"
     *                                       ↑    ↑
     *                                      from  to   (both in old text)
     *
     * Maps directly to editor change events:
     *   VSCode / Monaco:  doc.edit(change.rangeOffset, change.rangeOffset + change.rangeLength, change.text)
     *   CodeMirror 6:     doc.edit(change.from, change.to, change.insert)
     *   LSP:              doc.edit(startByte, endByte, change.text)  // after line/col → byte offset
     */
    edit(from: number, to: number, replacement: string): ParseDoc<N>;
}
export declare function makeParseDoc<N extends NodeLike>(parser: Parser<N>, ruleName: string, input: string, trivia?: Combinator<unknown>): ParseDoc<N>;
