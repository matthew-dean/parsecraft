import type { Combinator } from '../types.ts';
/**
 * Runs `parser` with `ctx.state` set to `extra` for the duration of the parse.
 * The outer user context is restored on exit (lexical scoping).
 *
 *   const functionBody = withCtx({ inFn: true },
 *     sequence(literal('{'), many(statement), literal('}'))
 *   )
 *
 * Read back with guard() or from within a transform's span argument.
 */
export declare function withCtx<U, T>(extra: U, parser: Combinator<T>): Combinator<T>;
