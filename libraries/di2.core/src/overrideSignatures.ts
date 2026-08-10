import type { Type } from '@rhombus-std/primitives';
import type { Signatures } from './types';

/**
 * Overlays a sparse positional `overrides` array onto each derived dependency signature, so a
 * caller registering a class whose constructor it cannot edit — third-party, or generic — can pin
 * individual parameters and keep the derived ones for the rest.
 *
 * @remarks
 * A hole and an explicit `undefined` are NOT the same override. `Object.assign` copies own
 * enumerable indices: a hole is not one, so the derived parameter survives it, while an explicit
 * `undefined` is one and overwrites. `length` is own but not enumerable, so a short `overrides`
 * never truncates.
 *
 * The type layer cannot make that distinction — `[, Redis]` and `[undefined, Redis]` infer the
 * same tuple — so it reads both as "keep the derived one" and diverges from the second case.
 *
 * @example
 * ```ts
 * overrideSignatures([[A, B]], [Redis, undefined]); // → [[Redis, undefined]]
 * overrideSignatures([[A, B, C]], [, Redis]);       // → [[A, Redis, C]]
 * overrideSignatures([[A, B]], [Redis]);            // → [[Redis, B]]  — length kept
 * ```
 */
export function overrideSignatures(signatures: Signatures,
  overrides: ReadonlyArray<Type | string | undefined>): Signatures {
  return signatures.map(signature => Object.assign(signature.slice(), overrides));
}
