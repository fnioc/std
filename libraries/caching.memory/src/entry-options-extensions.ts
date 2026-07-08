// The MemoryCacheEntryOptions-consuming convenience wrappers. These belong to
// ME.Caching.Abstractions' CacheEntryExtensions / CacheExtensions, but they
// reference MemoryCacheEntryOptions, which this family places in
// caching.memory (see the README note on the split) -- so the options-typed
// overloads live here rather than in caching.core. Authored as named object
// literals (docs §28); the caching.core `CacheExtensions`/`CacheEntryExtensions`
// names are taken by their host package, so the IMemoryCache-receiver literal
// is `MemoryCacheExtensions` and the ICacheEntry-receiver literal
// `MemoryCacheEntryExtensions` (both real reference class names, and the
// `Memory` prefix marks that they carry the MemoryCacheEntryOptions-typed forms
// that live in this package).

import type { ICacheEntry, IMemoryCache } from "@rhombus-std/caching.core";
import { CacheEntryExtensions } from "@rhombus-std/caching.core";
import type { AugmentationSet } from "@rhombus-std/primitives";
import { MemoryCacheEntryOptions } from "./memory-cache-entry-options";

/**
 * Applies every value of `options` to `entry` (the `SetOptions` port). Throws
 * if `options` carries a post-eviction registration with no callback.
 */
function setEntryOptions(entry: ICacheEntry, options: MemoryCacheEntryOptions): ICacheEntry {
  entry.absoluteExpiration = options.absoluteExpiration;
  entry.absoluteExpirationRelativeToNow = options.absoluteExpirationRelativeToNow;
  entry.slidingExpiration = options.slidingExpiration;
  entry.priority = options.priority;
  entry.size = options.size;

  const expirationTokens = options.expirationTokensDirect;
  if (expirationTokens !== undefined) {
    for (const token of expirationTokens) {
      CacheEntryExtensions.addExpirationToken(entry, token);
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
function setWithOptions<T>(
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
function getOrCreateWithOptions<T>(
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
async function getOrCreateAsyncWithOptions<T>(
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

/** The IMemoryCache options-typed wrappers (the `Set`/`GetOrCreate(options)` ports; docs §28). */
export const MemoryCacheExtensions = {
  setWithOptions,
  getOrCreateWithOptions,
  getOrCreateAsyncWithOptions,
} satisfies AugmentationSet<IMemoryCache>;

/** The ICacheEntry options-typed wrapper (the `SetOptions` port; docs §28). */
export const MemoryCacheEntryExtensions = {
  setEntryOptions,
} satisfies AugmentationSet<ICacheEntry>;
