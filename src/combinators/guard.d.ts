import type { Combinator } from '../types.ts';
/**
 * Zero-width assertion: succeeds (consuming nothing) only when `predicate`
 * returns true for `ctx.state`. Fails otherwise.
 *
 * Intended for use inside sequence() to gate subsequent parsing on runtime
 * context set with withCtx().
 *
 *   const returnStmt = sequence(
 *     guard(ctx => (ctx as { inFn: boolean }).inFn),
 *     literal('return'), optional(expr)
 *   )
 */
export declare function guard(predicate: (state: unknown) => boolean): Combinator<null>;
