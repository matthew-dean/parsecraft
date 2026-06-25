import type { Combinator, ParseContext, ParseResult } from '../types.ts';
export declare function transform<T, U>(combinator: Combinator<T>, fn: (value: T, span: {
    start: number;
    end: number;
}) => U): Combinator<U>;
export declare function skip<T, S>(main: Combinator<T>, skipped: Combinator<S>): Combinator<T>;
export declare function trivia<T>(combinator: Combinator<T>): Combinator<T>;
export declare function label<T>(name: string, combinator: Combinator<T>): Combinator<T>;
