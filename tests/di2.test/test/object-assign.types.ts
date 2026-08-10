// Type-level checks for the `Object.assign` augmentation: the `assign<…>` alias and the global
// signature that returns it. Never executed -- `testit` is ambient, so calling it at runtime would
// throw. The file earns its keep through `lint` (`tsc --noEmit`), which is why the name keeps it
// out of bun's test glob.
//
// The `@ts-expect-error` lines are the load-bearing half. A broken `assign` tends to collapse to
// `never`, and `never` satisfies every constraint -- so the positive cases keep passing and only an
// expected-error that stops erroring reveals it.

import type { assign } from '@rhombus-std/di2.core';

// Spelled out rather than inferred from a sparse literal, which is the point worth seeing: `[, 5]`
// and `[undefined, 5]` infer the same tuple, so a hole is not something the type layer can react to.
declare const a123: readonly [1, 2, 3];
declare const a_7: readonly [undefined, 7];
declare const a_5_4: readonly [undefined, 5, undefined, 4];
declare const aABC: readonly ['A', 'B', 'C'];
declare const a_X: readonly [undefined, 'X'];
declare const a_HOTDOG__BANANA: readonly [undefined, 'hotdog', undefined, undefined, 'banana'];
type A123 = typeof a123;
type A_7 = typeof a_7;
type A_5_4 = typeof a_5_4;
type AABC = typeof aABC;
type A_X = typeof a_X;
type A_HOTDOG__BANANA = typeof a_HOTDOG__BANANA;

/** Asserts `U` is assignable to `T` — as a type pair, or as an expected value beside a real one. */
declare function testit<T, U extends T>(): void;
declare function testit<T, U extends T>(expected: T, actual: U): void;

testit([1] as const, Object.assign([1] as const, []));
testit([1] as const, Object.assign([], [1] as const));
// @ts-expect-error
testit([] as const, Object.assign([], [1] as const));

// A hole and an explicit `undefined` read alike in a tuple type, so both defer to the base.
testit<[1, 5, 3], assign<[A123, [undefined, 5]]>>();
testit([1, 5, 3] as const, Object.assign(a123, [undefined, 5] as const));
// @ts-expect-error
testit<[1, 5, 33], assign<[A123, [undefined, 5]]>>();
// @ts-expect-error
testit([1, 5, 33] as const, Object.assign(a123, [undefined, 5] as const));

// A longer overlay extends the result; a shorter one leaves the tail alone.
testit<[1, 5, 3, 4], assign<[A123, A_5_4]>>();
testit([1, 5, 3, 4] as const, Object.assign(a123, a_5_4));
// @ts-expect-error
testit<[1, 5, 33, 4], assign<[A123, A_5_4]>>();
// @ts-expect-error
testit([1, 5, 33, 4] as const, Object.assign(a123, a_5_4));

testit<[1, 7, 3, 4], assign<[A123, A_5_4, A_7]>>();
testit([1, 7, 3, 4] as const, Object.assign(a123, a_5_4, a_7));
// @ts-expect-error
testit<[1, 7, 33, 4], assign<[A123, A_5_4, A_7]>>();
// @ts-expect-error
testit([1, 7, 33, 4] as const, Object.assign(a123, a_5_4, a_7));

testit<[1, 'hotdog', 3, 4, 'banana'], assign<[A123, A_5_4, A_7, A_HOTDOG__BANANA]>>();
testit([1, 'hotdog', 3, 4, 'banana'] as const, Object.assign(a123, a_5_4, a_7, a_HOTDOG__BANANA));
// @ts-expect-error
testit<[1, 'hotdog', 3, null, 'banana'], assign<[A123, A_5_4, A_7, A_HOTDOG__BANANA]>>();
// @ts-expect-error
testit([1, 'hotdog', 3, null, 'banana'] as const, Object.assign(a123, a_5_4, a_7, a_HOTDOG__BANANA));

// Objects merge by key rather than by index.
testit<{ a: 12; b: 55; }, assign<[{ a: 12; b: 44; }, { b: 55; }]>>();
testit({ a: 12, b: 55 } as const, Object.assign({ a: 12, b: 44 } as const, { b: 55 } as const));
// @ts-expect-error
testit<{ a: 12; b: 44; }, assign<[{ a: 12; b: 44; }, { b: 55; }]>>();
// @ts-expect-error
testit({ a: 12, b: 44 } as const, Object.assign({ a: 12, b: 44 } as const, { b: 55 } as const));

testit<['A', 'X', 'C'], assign<[AABC, A_X]>>();
testit(['A', 'X', 'C'] as const, Object.assign(aABC, a_X));
// @ts-expect-error
testit<['A', 'B', 'C'], assign<[AABC, A_X]>>();
// @ts-expect-error
testit(['A', 'B', 'C'] as const, Object.assign(aABC, a_X));
