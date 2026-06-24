import type { Combinator } from '../types.ts';
export type LiteralOptions = {
    caseInsensitive?: boolean;
};
export declare function literal(value: string, opts?: LiteralOptions): Combinator<string>;
