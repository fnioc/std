// `signatureof(ctor)` binds a class constructor or factory function and, at build time, becomes
// the positional `[[slot, ...], ...]` dependency-signature array `addClass`/`addFactory` take as
// their third argument — one inner array per constructor/call overload.

import type { Signatures } from '@rhombus-std/di.core';
import type { Ctor, Func } from '@rhombus-toolkit/func';

/**
 * Dependency signature for a class constructor or factory function.
 *
 * @example
 * ```ts
 * this.addClass(typefor<IFoo>(), Foo, signatureof(Foo));
 * ```
 */
export function signatureof(target: Ctor | Func<never[], unknown>): Signatures {
  void target;
  throw new Error(
    'signatureof(ctor) requires the @rhombus-std/di.extras authoring transform. '
      + 'Depend on @rhombus-std/di.extras so ttsc spawns the @rhombus-std transform '
      + 'host (which lowers signatureof), or pass the dependency signatures explicitly as '
      + 'the third argument to addClass(token, ctor, signatures).',
  );
}

export const SIGNATUREOF_NAME = 'signatureof';
