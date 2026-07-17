// `signatureof(ctor)` — the compile-time dependency-signature mechanism, sibling
// to `nameof<T>()` (PRD §8 "Token generation").
//
// Where `nameof<IFoo>()` binds a TYPE argument and lowers to a token string,
// `signatureof(ctor)` binds a VALUE argument — a class constructor or a factory
// function — and lowers to the positional dependency-signature array a
// hand-written `add("token", ctor, [[...]])` would carry: `[[slot, ...], ...]`,
// one inner array per constructor / call overload. The transformer derives it
// from the value's constructor / call parameter types at compile time, so callers
// never ship the derivation logic to runtime.
//
// The runtime body exists only so that un-transformed code fails loudly instead
// of silently returning `undefined` — calling `signatureof` without the
// transformer wired up throws a clear error pointing at the missing plugin,
// exactly like `nameof`.
//
// It lives in `@rhombus-std/primitives` (the zero-dep leaf) rather than in di.core
// so a single primitive symbol has one home every library imports from, and so
// the leaf carries no di.core dependency. Its return type is therefore a
// primitives-LOCAL structural mirror of di.core's `DepSlot` array — the two are
// structurally identical, so the result is assignable to di.core's
// `add(token, ctor, signatures?)` third parameter without primitives depending on
// di.core (which would invert the family dependency direction).

import type { Token } from './Token.js';

/**
 * A factory-injected parameter slot — the token of the produced type plus the
 * caller-supplied parameter tokens. Structural mirror of di.core's `FactoryRef`.
 */
export interface FactoryRefLike {
  readonly type: Token;
  readonly params?: readonly Token[];
}

/**
 * A set of alternative dependency slots tried in order. Structural mirror of
 * di.core's `Union`.
 */
export interface UnionLike {
  readonly union: readonly DepSlotLike[];
}

/**
 * A singular type supplying its value directly. Structural mirror of di.core's
 * `LiteralRef` — identified by the PRESENCE of `value` (which may be `undefined`).
 */
export interface LiteralRefLike {
  readonly value: string | number | boolean | bigint | undefined | null;
}

/**
 * The token string of a registration type argument. Structural mirror of
 * di.core's `TypeArgRef`.
 */
export interface TypeArgRefLike {
  readonly typeArg: number;
}

/**
 * One positional dependency slot. Structurally identical to di.core's `DepSlot`,
 * so a `signatureof` result is assignable to di.core's registration surface.
 */
export type DepSlotLike = Token | FactoryRefLike | UnionLike | LiteralRefLike | TypeArgRefLike;

/**
 * The positional dependency signatures of a constructor / factory — one inner
 * array per overload. Structurally identical to di.core's
 * `readonly (readonly DepSlot[])[]`.
 */
export type DepSignatures = readonly (readonly DepSlotLike[])[];

/** A class constructor `signatureof` can read parameter types from. */
export type ConstructSignatureLike = abstract new(...args: never) => unknown;

/** A factory function `signatureof` can read parameter types from. */
export type CallSignatureLike = (...args: never) => unknown;

/**
 * Compile-time dependency signature for a class or factory. Rewritten by the
 * transformer to the `[[...]]` array literal; the runtime body only runs when
 * the transformer is absent.
 *
 * @example
 * ```ts
 * // authored inside a sugar body:
 * this.add(nameof<IFoo>(), Foo, signatureof(Foo)); // → add("pkg:IFoo", Foo, [["pkg:IDep"]])
 * ```
 */
export function signatureof(target: ConstructSignatureLike | CallSignatureLike): DepSignatures {
  void target;
  throw new Error(
    'signatureof(ctor) requires the @rhombus-std/primitives.transformer plugin. Add '
      + '{ "transform": "@rhombus-std/primitives.transformer/signatureof-ttsc" } to your '
      + 'tsconfig "plugins", or pass the dependency signatures explicitly as the third '
      + 'argument to add(token, ctor, signatures).',
  );
}

/** The exported identifier name the transformer recognizes as `signatureof`. */
export const SIGNATUREOF_NAME = 'signatureof';
