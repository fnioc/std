// `overrideSignatures(signatures, overrides)` — the registration-time dependency
// override merge (§99). It overlays a sparse `overrides` array positionally onto
// each derived dependency signature, so a caller registering a class whose
// constructor it cannot edit (third-party / generic) can pin specific parameter
// tokens while keeping the transformer-derived ones for the rest.
//
// The merge is a plain `Object.assign` over a COPY of each signature, which gives
// the sparse semantics for free: `Object.assign` copies only the source's OWN
// ENUMERABLE indices, so
//   - a HOLE in `overrides` (`['x:A', , 'x:C']` — no element at index 1) is not an
//     own property, so it is skipped and the derived slot at that position is kept;
//   - an explicit `undefined` element IS an own property, so it overwrites the slot
//     with `undefined`;
//   - a string element overwrites the slot with that token.
// An array's `length` is own but NON-enumerable, so a shorter `overrides` never
// truncates the derived signature.
//
// This is a RUNTIME helper (unlike the compile-time `signaturefor` / `signatureof`
// primitives): it runs in shipped code. The tokenless `addClass<I>(C, overrides)`
// sugar lowers to `addClass(tokenfor<I>(), C, overrideSignatures(signatureof(C),
// overrides), …)`, but a no-transformer caller composes it by hand just as
// readily — the override array need not be a literal (any expression producing it
// is legal), which is the whole point of doing the merge at runtime rather than in
// the transformer.

import type { DepSignatures, DepSlot } from './types.js';

/**
 * Merge a sparse positional `overrides` array over each derived dependency
 * signature. A hole keeps the derived slot; an explicit `undefined` overwrites it
 * with `undefined`; a string overwrites it with that token.
 *
 * @example
 * ```ts
 * // derived [["x:IA", "x:IB"]] with overrides ["x:IRedis", undefined]
 * overrideSignatures([["x:IA", "x:IB"]], ["x:IRedis", undefined]); // → [["x:IRedis", undefined]]
 * overrideSignatures([["x:IA", "x:IB"]], ["x:IRedis"]);            // → [["x:IRedis", "x:IB"]]  (length kept)
 * ```
 */
export function overrideSignatures(
  signatures: DepSignatures,
  overrides: ReadonlyArray<string | undefined>,
): DepSignatures {
  return signatures.map((signature) => Object.assign(signature.slice(), overrides) as readonly DepSlot[]);
}
