import type { FirstSet } from '../types.ts';
export declare function union(a: FirstSet, b: FirstSet): FirstSet;
export declare function intersects(a: FirstSet, b: FirstSet): boolean;
export declare function fromChar(code: number): FirstSet;
export declare function fromRange(lo: number, hi: number): FirstSet;
export declare function any(): FirstSet;
export declare function empty(): FirstSet;
