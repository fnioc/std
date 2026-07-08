// The MemoryCacheEntryOptions-consuming convenience wrappers. These belong to
// ME.Caching.Abstractions' CacheEntryExtensions / CacheExtensions, but they
// reference MemoryCacheEntryOptions, which this family places in
// caching.memory (see the README note on the split) -- so the options-typed
// overloads live here rather than in caching.core.

import type { ICacheEntry, IMemoryCache } from "@rhombus-std/caching.core";
import { addExpirationToken } from "@rhombus-std/caching.core";
import { MemoryCacheEntryOptions } from "./memory-cache-entry-options";

/**
 * Applies every value of `options` to `entry` (the `SetOptions` port). Throws
 * if `options` carries a post-eviction registration with no callback.
 */
export function setEntryOptions(entry: ICacheEntry, options: MemoryCacheEntryOptions): ICacheEntry {
  entry.absoluteExpiration = options.absoluteExpiration;
  entry.absoluteExpirationRelativeToNow = options.absoluteExpirationRelativeToNow;
  entry.slidingExpiration = options.slidingExpiration;
  entry.priority = options.priority;
  entry.size = options.size;

  const expirationTokens = options.expirationTokensDirect;
  if (expirationTokens !== undefined) {
    for (const token of expirationTokens) {
      addExpirationToken(entry, token);
    }
  }

  const postEvictionCallbacks = options.postEvictionCallbacksDirect;
  if (postEvictionCallbacks !== undefined) {
    for (let i = 0; i < postEvictionCallbacks.length; i++) {
      const registration = postEvictionCallbacks[i]!;
      if (registration.evictionCallback === undefined) {
        throw new Error(
          `MemoryCacheEntryOptions.postEvictionCallbacks contains a registration with no evictionCallback at index ${i}.`,
        );
      }
      entry.postEvictionCallbacks.push(registration);
    }
  }

  return entry;
}

/** Sets `value` at `key`, applying `options` to the entry (the `Set(options)` port). */
export function setWithOptions<T>(
  cache: IMemoryCache,
  key: unknown,
  value: T,
  options?: MemoryCacheEntryOptions,
): T {
  const entry = cache.createEntry(key);
  if (options !== undefined) {
    setEntryOptions(entry, options);
  }
  entry.value = value;
  entry[Symbol.dispose]();
  return value;
}

/**
 * {@link getOrCreate} with `createOptions` applied to the fresh entry before
 * the factory runs (the `GetOrCreate(createOptions)` port).
 */
export function getOrCreateWithOptions<T>(
  cache: IMemoryCache,
  key: unknown,
  factory: (entry: ICacheEntry) => T,
  createOptions?: MemoryCacheEntryOptions,
): T | undefined {
  const result = cache.tryGetValue(key);
  if (result[0]) {
    return result[1] as T | undefined;
  }
  const entry = cache.createEntry(key);
  if (createOptions !== undefined) {
    setEntryOptions(entry, createOptions);
  }
  const value = factory(entry);
  entry.value = value;
  entry[Symbol.dispose]();
  return value;
}

/** Async {@link getOrCreateWithOptions}. */
export async function getOrCreateAsyncWithOptions<T>(
  cache: IMemoryCache,
  key: unknown,
  factory: (entry: ICacheEntry) => Promise<T>,
  createOptions?: MemoryCacheEntryOptions,
): Promise<T | undefined> {
  const result = cache.tryGetValue(key);
  if (result[0]) {
    return result[1] as T | undefined;
  }
  const entry = cache.createEntry(key);
  if (createOptions !== undefined) {
    setEntryOptions(entry, createOptions);
  }
  const value = await factory(entry);
  entry.value = value;
  entry[Symbol.dispose]();
  return value;
}
