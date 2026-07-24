import type { AbortSignal } from '@rhombus-std/primitives';
import type { HybridCacheEntryOptions } from './HybridCacheEntryOptions';

/**
 * Provides multi-tier caching services building on `IDistributedCache`
 * backends.
 */
export abstract class HybridCache {
  /**
   * Gets the value for `key` if present; otherwise runs `factory` to generate
   * one, caches it, and returns it.
   */
  public abstract getOrCreate<T>(key: string, factory: (abortSignal: AbortSignal) => Promise<T>,
    options?: HybridCacheEntryOptions, tags?: Iterable<string>, abortSignal?: AbortSignal): Promise<T>;

  /** Sets or overwrites the value for `key`. */
  public abstract set<T>(key: string, value: T, options?: HybridCacheEntryOptions, tags?: Iterable<string>,
    abortSignal?: AbortSignal): Promise<void>;

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
