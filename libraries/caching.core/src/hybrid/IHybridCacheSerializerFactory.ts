// IHybridCacheSerializerFactory -- ported from ME.Caching.Abstractions'
// Hybrid/IHybridCacheSerializerFactory.
//
// Platform adaptations from the reference:
//   - The `bool TryCreateSerializer<T>([NotNullWhen(true)] out ...)` try-shape
//     maps to returning the serializer or `undefined` on a miss (the repo
//     idiom; the pair is isomorphic since the out-value is non-null exactly
//     when the method returns true).
//   - The reference member takes no runtime argument: a factory inspects
//     `typeof(T)` reflectively to decide whether it supports the type. TS
//     erases `T`, so the type's identity must arrive as a value -- the runtime
//     type token (docs §40), derived inline at call sites via `nameof<T>()`
//     (or written as the literal string by hand), is the platform analog of
//     `typeof(T)`.

import type { Token } from '@rhombus-std/primitives';
import type { IHybridCacheSerializer } from './IHybridCacheSerializer';

/** Factory provider for per-type {@link IHybridCacheSerializer} instances. */
export interface IHybridCacheSerializerFactory {
  /**
   * Requests a serializer for the provided type, if possible.
   *
   * @param type The token of the type being serialized or deserialized -- the
   * runtime analog of `T`, derived inline via `nameof<T>()` (docs §40).
   * @returns The serializer, or `undefined` if the factory does not support
   * this type.
   */
  tryCreateSerializer<T>(type: Token): IHybridCacheSerializer<T> | undefined;
}
