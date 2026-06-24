import type { Combinator } from '../types.ts';
/**
 * Create a forward-declared parser slot for mutually recursive grammars.
 *
 * Because JS evaluates arguments eagerly, you can't reference a variable
 * before it's declared. ref() creates a placeholder you fill in later:
 *
 *   const value = ref<JSONValue>()
 *   const array  = transform(sequence(literal('['), sepBy(value, literal(',')), literal(']')), ...)
 *   const object = transform(sequence(literal('{'), sepBy(pair, literal(',')), literal('}')), ...)
 *   value.define(choice(object, array, string, number, bool, nullVal))
 *
 * Unlike lazy(() => x), you use the ref directly — no wrapping at each call site.
 */
export declare function ref<T>(): Combinator<T> & {
    define(p: Combinator<T>): void;
};
