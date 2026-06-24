import type { Combinator } from '../types.ts';
type UnwrapParsers<T extends Combinator<unknown>[]> = {
    [K in keyof T]: T[K] extends Combinator<infer U> ? U : never;
};
export declare function sequence<T extends [Combinator<unknown>, ...Combinator<unknown>[]]>(...parsers: T): Combinator<UnwrapParsers<T>>;
export {};
