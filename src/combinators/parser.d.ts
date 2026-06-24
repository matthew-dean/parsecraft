import type { Combinator } from '../types.ts';
/**
 * Define named grammar rules without forward declarations.
 *
 * Pass a factory that receives all rule names as references (via a Proxy)
 * and returns a record of combinators. rules() handles creating ref()
 * placeholders and wiring them up — the user never sees ref() at all.
 *
 *   const { value } = rules(g => ({
 *     value:  choice(g.object, g.array, str, num, bool, nil),
 *     object: transform(sequence('{', sepBy(g.pair, ','), '}'), Object.fromEntries),
 *     array:  transform(sequence('[', sepBy(g.value, ','), ']'), ([, items]) => items),
 *     pair:   transform(sequence(g.key, literal(':'), g.value), ([k,, v]) => [k, v]),
 *   }))
 *
 * Not every name in the factory must appear in the returned object — local helpers
 * (like `comma`, `key`) can be plain const inside the factory and composed normally.
 * Only names that OTHER rules reference via `g.xxx` need to be in the returned record.
 *
 * TypeScript: use an explicit type parameter for full type safety on `g`:
 *   rules<{ value: Combinator<JSONValue>; array: Combinator<JSONValue[]> }>(g => ({ ... }))
 * Without it, `g.*` accesses are typed as `any` but the return is still inferred.
 */
export declare function rules<T extends Record<string, Combinator<unknown>>>(factory: (self: any) => T): T;
