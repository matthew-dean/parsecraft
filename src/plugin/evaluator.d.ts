/**
 * Statically evaluates parseman combinator call expressions from an oxc AST
 * into actual Combinator<unknown> objects by calling the real library functions.
 *
 * Returns null for anything unresolvable (external variables, template literals,
 * computed keys, etc.) — callers leave those as-is.
 */
import type { Expression, Node } from '@oxc-project/types';
import type { Combinator } from '../types.ts';
export type ScopeEntry = {
    combi: Combinator<unknown>;
    mfSrcs: string[];
};
export type Scope = Map<string, ScopeEntry>;
/** Evaluate a single combinator expression. Returns null if unresolvable. */
export declare function evaluateExpr(node: Expression, scope: Scope, code?: string, mapFnSources?: string[]): Combinator<unknown> | null;
/**
 * Evaluate a `parser(g => { ... return { ruleName: combinator, ... } })` call.
 * Returns a map of rule names → defined Combinators, or null if the factory
 * can't be statically evaluated.
 *
 * mapFnSources is populated with the sources for mapFns that codegen will push
 * when compiling each returned rule — each rule's entry in the map will produce
 * a sub-slice of mapFnSources aligned to its specific ctx.mapFns.
 *
 * Important: this function uses a SEPARATE accumulator for body statement
 * evaluation so that only the return-expression phase adds entries to the
 * caller-provided mapFnSources (which is what compile() will receive).
 * The body-phase entries are stored as `mfSrcs` on localScope entries and
 * replayed when those entries are referenced during return evaluation.
 */
export declare function evaluateParserFactory(factoryNode: Expression, scope: Scope, code: string, mapFnSources: string[]): Map<string, Combinator<unknown>> | null;
/** Check if an AST node references any name from the given scope or names set. */
export declare function referencesAny(node: Node, names: Set<string>, scope: Scope): boolean;
