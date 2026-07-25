import type { DepSignatures, DepSlot } from './types.js';

/**
 * Overlays a sparse positional `overrides` array onto each derived dependency
 * signature, so a caller registering a class whose constructor it cannot edit
 * (third-party, or generic) can pin individual parameter tokens and keep the
 * derived ones for the rest.
 *
 * @remarks
 * The merge is `Object.assign` over a COPY of each signature, which buys the
 * sparse semantics for free — `Object.assign` copies only OWN ENUMERABLE indices:
 *   - a HOLE (`['x:A', , 'x:C']` — no element at index 1) is not an own property,
 *     so the derived slot at that position is kept;
 *   - an explicit `undefined` element IS one, so it overwrites the slot with
 *     `undefined`;
 *   - a string element overwrites the slot with that token.
 *
 * An array's `length` is own but NON-enumerable, so a shorter `overrides` never
 * truncates the derived signature. It merges at registration time, so `overrides`
 * need not be a literal — any expression producing the array works.
 *
 * @example
 * ```ts
 * // derived [["x:IA", "x:IB"]] with overrides ["x:IRedis", undefined]
 * overrideSignatures([["x:IA", "x:IB"]], ["x:IRedis", undefined]); // → [["x:IRedis", undefined]]
 * overrideSignatures([["x:IA", "x:IB"]], ["x:IRedis"]);            // → [["x:IRedis", "x:IB"]]  (length kept)
 * ```
 */
export function overrideSignatures(signatures: DepSignatures,
  overrides: ReadonlyArray<string | undefined>): DepSignatures
{
  return signatures.map((signature) => Object.assign(signature.slice(), overrides) as readonly DepSlot[]);
}
