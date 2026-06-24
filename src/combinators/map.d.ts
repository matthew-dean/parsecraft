import type { Combinator } from '../types.ts';
export declare function transform<T, U>(parser: Combinator<T>, fn: (value: T, span: {
    start: number;
    end: number;
}) => U): Combinator<U>;
export declare function skip<T, S>(main: Combinator<T>, skipped: Combinator<S>): Combinator<T>;
export declare function trivia<T>(parser: Combinator<T>): Combinator<T>;
