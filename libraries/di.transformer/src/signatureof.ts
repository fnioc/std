// `signatureof(ctor)` — the compile-time dependency-signature mechanism, sibling
// to `tokenfor<T>()` (PRD §8 "Token generation").
//
// Where `tokenfor<IFoo>()` binds a TYPE argument and lowers to a token string,
// `signatureof(ctor)` binds a VALUE argument — a class constructor or a factory
// function — and lowers to the positional dependency-signature array a
// hand-written `addClass("token", ctor, [[...]])` would carry: `[[slot, ...], ...]`,
// one inner array per constructor / call overload. The transformer derives it
// from the value's constructor / call parameter types at compile time, so callers
// never ship the derivation logic to runtime.
//
// The runtime body exists only so that un-transformed code fails loudly instead
// of silently returning `undefined` — calling `signatureof` without the
// transformer wired up throws a clear error pointing at the missing plugin,
// exactly like `tokenfor`.
//
// It lives here in `@rhombus-std/di.transformer` (the authoring-time DI package),
// NOT in the `@rhombus-std/primitives` leaf, because it is ONLY ever called inside
// the inline-sugar bodies (`./inline.ts`) — never in runtime source — so it is an
// authoring-time construct that belongs with the domain transformer. Because this
// package peers on `@rhombus-std/di.core`, `signatureof` returns di.core's REAL
// `DepSignatures` directly, with no structural mirror.

import type { DepSignatures, DepTarget } from '@rhombus-std/di.core';

/**
 * Compile-time dependency signature for a class or factory. Rewritten by the
 * transformer to the `[[...]]` array literal; the runtime body only runs when
 * the transformer is absent.
 *
 * @example
 * ```ts
 * // authored inside a sugar body:
 * this.addClass(tokenfor<IFoo>(), Foo, signatureof(Foo)); // → addClass("pkg:IFoo", Foo, [["pkg:IDep"]])
 * ```
 */
export function signatureof(target: DepTarget): DepSignatures {
  void target;
  throw new Error(
    'signatureof(ctor) requires the @rhombus-std/di.transformer authoring transform. '
      + 'Depend on @rhombus-std/di.transformer so ttsc spawns the @rhombus-std transform '
      + 'host (which lowers signatureof), or pass the dependency signatures explicitly as '
      + 'the third argument to addClass(token, ctor, signatures).',
  );
}

/** The exported identifier name the transformer recognizes as `signatureof`. */
export const SIGNATUREOF_NAME = 'signatureof';
