import type { Combinator } from '../types.ts';
export declare function many<T>(combinator: Combinator<T>): Combinator<T[]>;
export declare function oneOrMore<T>(combinator: Combinator<T>): Combinator<T[]>;
export declare function optional<T>(combinator: Combinator<T>): Combinator<T | null>;
export declare function sepBy<T, S>(combinator: Combinator<T>, separator: Combinator<S>): Combinator<T[]>;
