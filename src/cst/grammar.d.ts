import type { Combinator, Span } from '../types.ts';
import type { CSTNode, CSTLeaf, CSTError, CSTRawChild, NodeLike } from './types.ts';
import type { ParseDoc } from './incremental.ts';
type Capital = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M' | 'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z';
/** Keys of T whose names start with a capital letter (CST parser). */
export type RuleKeys<T> = {
    [K in keyof T & string]: K extends `${Capital}${string}` ? K : never;
}[keyof T & string];
/**
 * Maps each grammar property to its resolved Combinator type.
 *
 * Use as the parameter type in rule thunks — gives `g.*` the correct
 * Combinator type instead of the raw function type:
 *
 *   Expr = (g: Refs<this>) => choice(g.Atom, sequence(g.Expr, literal('+'), g.Atom))
 */
export type Refs<T> = {
    [K in keyof T as K extends `_${string}` ? never : T[K] extends Combinator<any> ? K : T[K] extends (g: any) => Combinator<any> ? K : never]: T[K] extends Combinator<infer V> ? Combinator<V> : T[K] extends (g: any) => Combinator<infer V> ? Combinator<V> : never;
};
/**
 * Base class for grammars that automatically produce a CST (or a custom AST
 * if you override `buildNode`).
 *
 * Rules are declared as class properties:
 *   - Plain Combinator  (no cross-references needed):
 *       digits = regex(/[0-9]+/)
 *   - Thunk  (references other parser via `g`):
 *       Expr = (g: Refs<this>) => choice(g.Atom, sequence(g.Expr, literal('+')))
 *
 * Convention:
 *   Capital letter → CSTNode-producing rule (span + state + children)
 *   lowercase      → transparent helper (terminals bubble up as CSTLeaf in the
 *                    nearest enclosing capital rule)
 *
 * Mutual recursion works because thunks are collected first, ref() placeholders
 * installed for each one, then all thunks are called with `g` (a map of refs).
 * Initialization is lazy — triggered on the first call to rule().
 *
 * Grammar inheritance: subclass property initializers naturally override parent
 * ones (they run last in construction order), so extending a grammar means only
 * re-declaring the parser you want to change.
 *
 *   class JSONCParser extends JSONParser {
 *     ws = jsoncWs  // override just this one rule
 *   }
 */
export declare class Parser<N extends NodeLike = CSTNode> {
    private _built;
    /** Set in a subclass to enable automatic trivia skipping between sequence terms. */
    protected _trivia?: Combinator<unknown>;
    private _build;
    /**
     * Override to produce a custom AST node instead of a plain CSTNode.
     * The returned object must satisfy NodeLike for IncrementalParser to work.
     *
     * `rawChildren` is `children` plus any trivia tokens (whitespace/comments)
     * consumed between terms, in parse order. Use it to inspect trivia when the
     * grammar is whitespace-sensitive (e.g. CSS descendant vs adjacent combinators).
     * The default implementation ignores `rawChildren`.
     */
    protected buildNode(type: string, span: Span, children: ReadonlyArray<N | CSTLeaf | CSTError>, state: unknown, _rawChildren: ReadonlyArray<CSTRawChild>): N;
    /** Wrap an inner combinator so it produces a CSTNode on each match. */
    private _makeNodeParser;
    /** Reconstruct a node with a new children array (used by IncrementalParser). */
    rebuild(node: N, newChildren: ReadonlyArray<N | CSTLeaf | CSTError>): N;
    /**
     * Parse input starting from a named rule, returning a ParseDoc.
     * The doc carries the tree, any parse errors, and an edit() method
     * for incremental re-parsing on subsequent changes.
     *
     *   const doc = css.parse('Stylesheet', src)
     *   doc.tree    // the CST root, or null on failure
     *   doc.errors  // ParseFail[], empty on success
     *
     *   // In an editor — just keep calling edit():
     *   const doc2 = doc.edit(newSrc, changeStart, changeEnd)
     */
    parse(ruleName: RuleKeys<this>, input: string): ParseDoc<N>;
    /**
     * Get the compiled Combinator for a named rule.
     * Triggers lazy initialization on first call.
     */
    rule(name: RuleKeys<this>): Combinator<N>;
}
export {};
