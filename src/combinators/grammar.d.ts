import type { Combinator, ParseContext, ParseResult } from '../types.ts';
export type ParseOptions = {
    trackLines?: boolean;
    /**
     * Enable error recovery. When true, recover() nodes collect their ParseErrors
     * into a side-channel array rather than (only) embedding them in the value tree.
     * The returned ParseOk will have an `errors` field listing all recovered errors.
     * Top-level parse failures (where no recover() node caught the error) still
     * return ParseFail as usual.
     */
    recover?: boolean;
};
export type ParserOptions = ParseOptions & {
    trivia?: Combinator<unknown>;
};
export interface ParsemanParser<T> extends Combinator<T> {
    parse(input: string): ParseResult<T>;
    parse(input: string, pos: number, ctx: ParseContext): ParseResult<T>;
}
export declare function parser<T>(opts: ParserOptions, root: Combinator<T>): ParsemanParser<T>;
export declare function parse<T>(combinator: Combinator<T>, input: string, opts?: ParseOptions): ParseResult<T>;
