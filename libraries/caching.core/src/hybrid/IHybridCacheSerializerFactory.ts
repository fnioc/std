// Returns the serializer or `undefined` on a miss, rather than a boolean plus
// an out-parameter. Since TS erases `T`, the type's identity must arrive as a
// value -- the token derived inline via `tokenfor<T>()` (or written literally
// by hand).

import type { Token } from '@rhombus-std/primitives';
import type { IHybridCacheSerializer } from './IHybridCacheSerializer';

/** Factory provider for per-type {@link IHybridCacheSerializer} instances. */
export interface IHybridCacheSerializerFactory {
  /**
   * Requests a serializer for the provided type, if possible.
   *
   * @param type The token of the type being serialized or deserialized -- the
   * runtime analog of `T`, derived inline via `tokenfor<T>()`.
   * @returns The serializer, or `undefined` if the factory does not support
   * this type.
   */
  tryCreateSerializer<T>(type: Token): IHybridCacheSerializer<T> | undefined;
}
