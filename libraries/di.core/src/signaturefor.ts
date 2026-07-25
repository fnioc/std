// `signaturefor<T>()` / `signaturesfor<T>()` MINT dependency slots from an
// EXPLICIT type tuple, where `signatureof(target)` OBSERVES them from a value's
// own parameter types. Minting spans the full `DepSlot` vocabulary — a plain
// token, a collection token, a `{ union }`, a `{ value }` literal, a
// `{ typeArg }` hole — not just the tokens `tokenfor<T>()` yields.

import type { DepSignatures, DepSlot } from './types.js';

/**
 * The dependency slots for ONE overload, derived from the type tuple `T`.
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
 * The dependency slots for a WHOLE overload set, derived from the
 * tuple-of-tuples `T`.
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

export const SIGNATUREFOR_NAME = 'signaturefor';

export const SIGNATURESFOR_NAME = 'signaturesfor';
