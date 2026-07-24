// MemoryDistributedCache -- ported from ME.Caching.Memory's
// MemoryDistributedCache: an IDistributedCache implemented over a PRIVATE
// MemoryCache (constructed here, never the DI-registered IMemoryCache -- the
// reference deliberately keeps the two stores separate).
//
// The reference's two constructors (with and without an ILoggerFactory,
// defaulting to the null logger factory) collapse into one optional
// parameter, the same collapse MemoryCache's own constructor makes. The
// sync+async member pairs collapse into the single Promise-returning members
// of the ported IDistributedCache; the bodies are synchronous over the inner
// MemoryCache, so each resolves immediately (the reference's async members
// likewise wrap their sync twins in a completed Task).

import type { DistributedCacheEntryOptions, IDistributedCache } from '@rhombus-std/caching.core';
import type { ILoggerFactory } from '@rhombus-std/logging.core';
import type { IOptions } from '@rhombus-std/options';
import { type AbortSignal, augment } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import { MemoryCache } from './MemoryCache';
import type { MemoryDistributedCacheOptions } from './MemoryDistributedCacheOptions';

// Binds the `IDistributedCache` interface symbol onto the class so the
// interface-merged wrapper methods (setString/getString, §80) flow onto it,
// beside the `@augment(tokenfor<IDistributedCache>())` install below.
export interface MemoryDistributedCache extends IDistributedCache {}

/** Implements `IDistributedCache` by storing items in a private in-memory {@link MemoryCache}. */
@augment(tokenfor<IDistributedCache>())
export class MemoryDistributedCache implements IDistributedCache {
  readonly #memCache: MemoryCache;

  /**
   * @param optionsAccessor The options of the cache (a bare
   * `new MemoryDistributedCacheOptions()` works -- it is its own `Options`
   * accessor).
   * @param loggerFactory Optional; the inner cache falls back to a null logger
   * when omitted.
   */
  public constructor(
    optionsAccessor: IOptions<MemoryDistributedCacheOptions>,
    loggerFactory?: ILoggerFactory,
  ) {
    this.#memCache = new MemoryCache(optionsAccessor.value, loggerFactory);
  }

  /** Gets the byte payload associated with `key`, or `undefined` if not present. */
  public get(key: string, _abortSignal?: AbortSignal): Promise<Uint8Array | undefined> {
    const result = this.#memCache.tryGetValue(key);
    return Promise.resolve(result[0] ? (result[1] as Uint8Array) : undefined);
  }

  /** Sets the byte payload associated with `key`, sized at its byte length. */
  public set(
    key: string,
    value: Uint8Array,
    options: DistributedCacheEntryOptions,
    _abortSignal?: AbortSignal,
  ): Promise<void> {
    // Dispose in `finally` (the reference `using`): a validating setter that
    // throws must still dispose the entry so the linked-entry tracking chain
    // (if enabled on the inner cache) is popped.
    const entry = this.#memCache.createEntry(key);
    try {
      entry.absoluteExpiration = options.absoluteExpiration;
      entry.absoluteExpirationRelativeToNow = options.absoluteExpirationRelativeToNow;
      entry.slidingExpiration = options.slidingExpiration;
      entry.size = value.length;
      entry.value = value;
    } finally {
      entry[Symbol.dispose]();
    }
    return Promise.resolve();
  }

  /**
   * Refreshes the item associated with `key`, resetting its sliding expiration
   * timeout (if any) -- a read for its access-time side effect.
   */
  public refresh(key: string, _abortSignal?: AbortSignal): Promise<void> {
    this.#memCache.tryGetValue(key);
    return Promise.resolve();
  }

  /** Removes the item associated with `key`. */
  public remove(key: string, _abortSignal?: AbortSignal): Promise<void> {
    this.#memCache.remove(key);
    return Promise.resolve();
  }
}
