// `signaturefor<T>()` / `signaturesfor<T>()` — the compile-time
// dependency-signature MINT mechanism: derive a `DepSlot` signature from an
// EXPLICIT type tuple, rather than OBSERVE it from a runtime value the way
// `signatureof(target)` reads a ctor's / factory's parameter types.
//
// The `-for` / `-of` suffix encodes the intent:
//   - `signatureof(ctor)`      OBSERVES the signature a value already carries.
//   - `signaturefor<[A, B]>()` MINTS one overload's slots from the type tuple
//     `[A, B]` — `signaturefor<[IA, IB]>()` → `["pkg:IA", "pkg:IB"]`.
//   - `signaturesfor<[[A, B], [C]]>()` MINTS the whole multi-overload signature
//     set from a tuple-of-tuples.
// Both REUSE `signatureof`'s extractor over the explicit type-tuple elements, so
// they express the FULL `DepSlot` vocabulary — a plain token, a collection
// token, a `{ union }`, a `{ value }` literal, a `{ typeArg }` hole — not the
// token-only map `tokenfor<T>()` produces. That is what lets a hand author (or the
// `withSignature<T>()` / `withSignatures<T>()` sugar bodies) express structured
// non-token slots from types alone.
//
// HOME — di.core, NOT `@rhombus-std/primitives` and NOT `di.extras`. These
// produce `DepSlot`s (a DI-domain shape di.core OWNS) and are called from BOTH
// runtime library source (a hardcoded `[["pkg:IA"]]` literal becomes
// `signaturefor<[IA]>()`) AND the sugar inline bodies. The only package every
// such caller already depends on — di.runtime libs depend on di.core;
// `di.extras` peers it — is di.core. `tokenfor` stays in `@rhombus-std/primitives`
// because `Token` is a primitives type; `DepSlot` is not, so that precedent does
// NOT carry the slot ABI up into the zero-dependency leaf.
//
// The runtime bodies exist only so that un-transformed code fails loudly instead
// of silently returning `undefined` — calling either without the transformer
// wired up throws a clear error pointing at the missing plugin, exactly like
// `tokenfor` / `signatureof`. The names are lowercase for family consistency.

import type { DepSignatures, DepSlot } from './types.js';

/**
 * Compile-time dependency signature for ONE overload, minted from the explicit
 * type tuple `T`. Rewritten by the transformer to the `[slot, ...]` array; the
 * runtime body only runs when the transformer is absent.
 *
 * @example
 * ```ts
 * manifest.withSignature(...signaturefor<[ILogger, IClock]>()); // → withSignature("pkg:ILogger", "pkg:IClock")
 * ```
 */
export function signaturefor<T extends readonly any[]>(): readonly DepSlot[] {
  void (0 as unknown as T);
  throw new Error(
    'signaturefor<T>() requires the @rhombus-std/di.extras authoring transform. '
      + 'Depend on @rhombus-std/di.extras so ttsc spawns the @rhombus-std transform '
      + 'host (which lowers signaturefor), or pass the dependency slots explicitly.',
  );
}

/**
 * Compile-time dependency signatures for the WHOLE overload set, minted from the
 * tuple-of-tuples `T`. Rewritten by the transformer to the `[[...], ...]` array;
 * the runtime body only runs when the transformer is absent.
 *
 * @example
 * ```ts
 * manifest.withSignatures(...signaturesfor<[[ILogger], [ILogger, IClock]]>());
 * ```
 */
export function signaturesfor<T extends ReadonlyArray<readonly any[]>>(): DepSignatures {
  void (0 as unknown as T);
  throw new Error(
    'signaturesfor<T>() requires the @rhombus-std/di.extras authoring transform. '
      + 'Depend on @rhombus-std/di.extras so ttsc spawns the @rhombus-std transform '
      + 'host (which lowers signaturesfor), or pass the dependency signatures explicitly.',
  );
}

/** The exported identifier name the transformer recognizes as `signaturefor`. */
export const SIGNATUREFOR_NAME = 'signaturefor';

/** The exported identifier name the transformer recognizes as `signaturesfor`. */
export const SIGNATURESFOR_NAME = 'signaturesfor';
