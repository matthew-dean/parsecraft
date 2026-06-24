import type { Combinator } from '../types.ts';
export declare function many<T>(parser: Combinator<T>): Combinator<T[]>;
export declare function oneOrMore<T>(parser: Combinator<T>): Combinator<T[]>;
export declare function optional<T>(parser: Combinator<T>): Combinator<T | null>;
export declare function sepBy<T, S>(parser: Combinator<T>, separator: Combinator<S>): Combinator<T[]>;
