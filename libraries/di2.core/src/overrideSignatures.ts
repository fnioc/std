import type { Type } from '@rhombus-std/primitives';
import type { assign } from '@rhombus-std/primitives';
import type { Signatures, TypeSignatures } from './types';

/**
 * Overlays a sparse positional `overrides` array onto each derived dependency signature, so a
 * caller registering a class whose constructor it cannot edit — third-party, or generic — can pin
 * individual parameters and keep the derived ones for the rest.
 *
 * @remarks
 * The merge is `Object.assign` over a COPY of each signature, which buys the sparse semantics for
 * free: it copies only OWN ENUMERABLE indices.
 *   - a HOLE (`[A, , C]` — no element at index 1) is not an own property, so the derived slot at
 *     that position survives;
 *   - an explicit `undefined` element IS one, so it overwrites the slot with `undefined`;
 *   - anything else overwrites the slot with itself.
 *
 * An array's `length` is own but NON-enumerable, so a shorter `overrides` never truncates the
 * derived signature. The overlay happens at registration time, so `overrides` need not be a
 * literal — any expression producing the array works.
 *
 * @example
 * ```ts
 * overrideSignatures([[A, B]], [Redis, undefined]); // → [[Redis, undefined]]
 * overrideSignatures([[A, B]], [Redis]);            // → [[Redis, B]]  — length kept
 * ```
 */
export function overrideSignatures(signatures: Signatures,
  overrides: ReadonlyArray<Type | string | undefined>): Signatures {
  return signatures.map(signature => {
    const merged = signature.slice();
    Object.assign(merged, overrides);
    return merged;
  });
}
export function overrideSignatures2<S extends TypeSignatures, O extends ReadonlyArray<Type | undefined>>(signatures: S,
  overrides: O) {
  return signatures.map((signature) => Object.assign(signature.slice(), overrides))
    .filter(<T>(p: T | undefined): p is T => !!p);
}
