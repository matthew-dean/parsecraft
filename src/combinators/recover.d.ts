import type { Combinator, ParseError } from '../types.ts';
export type { ParseError };
/**
 * Error-recovery combinator. Tries `combinator`; on success returns normally.
 * On failure, scans forward one character at a time until `sentinel` matches
 * (or EOF), then returns a ParseError node spanning the skipped range.
 * The sentinel is NOT consumed — the caller's grammar continues from there.
 *
 * Intended for IDE/incremental parsers that must produce a result even on
 * broken input. The error path is not optimized; use only where recovery
 * is genuinely needed, not on hot paths.
 *
 *   const stmt = choice(
 *     ifStmt, whileStmt,
 *     recover(exprStmt, literal(';'))
 *   )
 */
export declare function recover<T>(combinator: Combinator<T>, sentinel: Combinator<unknown>): Combinator<T | ParseError>;
export declare function isParseError(value: unknown): value is ParseError;
