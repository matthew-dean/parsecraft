import type { Combinator, GatedArm } from '../types.ts';
type ArmParser<T> = T extends GatedArm<infer U> ? Combinator<U> : T extends Combinator<infer U> ? Combinator<U> : never;
type UnionArms<T extends (Combinator<unknown> | GatedArm<unknown>)[]> = {
    [K in keyof T]: ArmParser<T[K]>;
}[number] extends Combinator<infer U> ? U : never;
export declare function choice<T extends [Combinator<unknown> | GatedArm<unknown>, ...(Combinator<unknown> | GatedArm<unknown>)[]]>(...args: T): Combinator<UnionArms<T>>;
/** Walk transform wrappers to find an inner literal's string value. */
export declare function getCoreLiteralValue(p: Combinator<unknown>): string | null;
/** Walk transform wrappers to find an inner regex's source/flags. */
export declare function getCoreRegexDef(p: Combinator<unknown>): {
    source: string;
    flags: string;
} | null;
export {};
