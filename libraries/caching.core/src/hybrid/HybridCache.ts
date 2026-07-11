// HybridCache -- ported from ME.Caching.Abstractions' Hybrid/HybridCache.
//
// Platform adaptations from the reference:
//   - `ValueTask`/`ValueTask<T>` map to `Promise`s, `CancellationToken token =
//     default` parameters to a trailing optional {@link AbortSignal} (docs
//     §39), `IEnumerable<string>` to `Iterable<string>`, and the `Async`
//     member suffix drops (the IDistributedCache convention: every member is
//     async, so the suffix carries no contrast).
//   - The `TState`-threading `GetOrCreateAsync<TState, T>(key, state,
//     factory)` overload pair collapses to the single state-less form. The
//     state plumbing exists so CLR callers can pass non-capturing (`static`)
//     lambdas and avoid a closure allocation -- plus the per-T memoized
//     `WrappedCallbackCache` bridging the sugar form onto it. JS has no
//     non-capturing-lambda optimization to preserve (every function closes
//     over its scope for free), so the stateful form cannot deliver its
//     benefit even in principle; a caller carries state in the closure.
//   - The `ReadOnlySpan<char>`/interpolated-string-handler key overloads are
//     alloc-avoidance shapes for building keys without materializing a
//     `string`; JS template literals ARE strings, so they collapse into the
//     one `string` key form.
//   - The abstract/virtual same-name arity overload pairs (`RemoveAsync`
//     string|keys, `RemoveByTagAsync` tag|tags) split into distinct names
//     ({@link HybridCache.remove}/{@link HybridCache.removeKeys},
//     {@link HybridCache.removeByTag}/{@link HybridCache.removeByTags}): a TS
//     class cannot mix an abstract signature and a base-implemented one under
//     one member name, and the split keeps each half independently
//     overridable, exactly mirroring the reference's abstract/virtual
//     semantics.
//   - The batch defaults drop the reference's count-0/count-1 collection
//     special cases (pure await-machinery avoidance); the plain loop is
//     behaviorally identical.

import type { AbortSignal } from '@rhombus-std/primitives';
import type { HybridCacheEntryOptions } from './HybridCacheEntryOptions';

/**
 * Provides multi-tier caching services building on `IDistributedCache`
 * backends.
 */
export abstract class HybridCache {
  /**
   * Asynchronously gets the value associated with the key if it exists, or
   * generates a new entry using the provided key and a value from the given
   * factory if the key is not found.
   *
   * @param key The key of the entry to look for or create.
   * @param factory Provides the underlying data service if the data is not
   * available in the cache.
   * @param options Additional options for this cache entry.
   * @param tags The tags to associate with this cache item.
   * @param abortSignal Propagates notifications that the operation should be
   * canceled.
   * @returns The data, either from cache or the underlying data service.
   */
  public abstract getOrCreate<T>(
    key: string,
    factory: (abortSignal: AbortSignal) => Promise<T>,
    options?: HybridCacheEntryOptions,
    tags?: Iterable<string>,
    abortSignal?: AbortSignal,
  ): Promise<T>;

  /**
   * Asynchronously sets or overwrites the value associated with the key.
   *
   * @param key The key of the entry to create.
   * @param value The value to assign for this cache entry.
   * @param options Additional options for this cache entry.
   * @param tags The tags to associate with this cache entry.
   * @param abortSignal Propagates notifications that the operation should be
   * canceled.
   */
  public abstract set<T>(
    key: string,
    value: T,
    options?: HybridCacheEntryOptions,
    tags?: Iterable<string>,
    abortSignal?: AbortSignal,
  ): Promise<void>;

  /** Asynchronously removes the value associated with the key if it exists. */
  public abstract remove(key: string, abortSignal?: AbortSignal): Promise<void>;

  /**
   * Asynchronously removes the values associated with the keys if they exist.
   * The default implementation calls {@link HybridCache.remove} for each key
   * in turn; implementations with a batch-remove primitive should override.
   */
  public async removeKeys(keys: Iterable<string>, abortSignal?: AbortSignal): Promise<void> {
    for (const key of keys) {
      await this.remove(key, abortSignal);
    }
  }

  /** Asynchronously removes all values associated with the specified tag. */
  public abstract removeByTag(tag: string, abortSignal?: AbortSignal): Promise<void>;

  /**
   * Asynchronously removes all values associated with the specified tags. The
   * default implementation calls {@link HybridCache.removeByTag} for each tag
   * in turn; implementations with a batch-remove primitive should override.
   */
  public async removeByTags(tags: Iterable<string>, abortSignal?: AbortSignal): Promise<void> {
    for (const tag of tags) {
      await this.removeByTag(tag, abortSignal);
    }
  }
}
