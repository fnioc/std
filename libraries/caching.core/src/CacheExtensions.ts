// The members build only on the three core `IMemoryCache` members
// (`tryGetValue`/`createEntry`/`remove`). `tryGetValue` shares its name with
// the primitive, so it installs as a dispatcher that routes to the
// primitive (see the registration below).
//
// `get<T>` covers both the typed and untyped reads -- a differing cast is
// the only distinction. `set` collapses its four expiration forms into one
// signature discriminated by argument type: `Date` -> absolute, `number`
// (ms) -> relative, an `IChangeToken` -> expiration token.
//
// The `MemoryCacheEntryOptions`-consuming forms (`setWithOptions`/
// `getOrCreateWithOptions`/`getOrCreateAsyncWithOptions`) get distinct member
// names rather than another overload, since a `MemoryCacheEntryOptions` bag
// isn't runtime-distinguishable from the `Date`/`number`/`IChangeToken`
// expiration argument `set`/`getOrCreate` already discriminate on.

import { type AugmentationSet, type IChangeToken, type MergeStrategies,
  registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { CacheEntryExtensions } from './CacheEntryExtensions';
import type { ICacheEntry } from './ICacheEntry';
import type { IMemoryCache } from './IMemoryCache';
import type { MemoryCacheEntryOptions } from './MemoryCacheEntryOptions';

/** Narrows the `expiration` union: an `IChangeToken` (not a `Date`/`number`). */
function isChangeToken(value: unknown): value is IChangeToken {
  return typeof value === 'object'
    && value !== null
    && typeof (value as IChangeToken).registerChangeCallback === 'function';
}

/** The `CacheExtensions` augmentation set for {@link IMemoryCache}. */
export const CacheExtensions = {
  /**
   * Gets the value associated with `key`, or `undefined` if not present. The
   * type parameter is an unchecked cast -- the stored value is not
   * runtime-verified against it.
   */
  get<T = unknown>(cache: IMemoryCache, key: unknown): T | undefined {
    const result = cache.tryGetValue(key);
    return result[0] ? (result[1] as T | undefined) : undefined;
  },
  /**
   * Tries to get the value associated with `key`. Returns `[true, value]` on a
   * hit (value cast to `T`), `[false]` on a miss.
   */
  tryGetValue<T = unknown>(cache: IMemoryCache, key: unknown): [found: false] | [found: true, value: T | undefined] {
    const result = cache.tryGetValue(key);
    return result[0] ? [true, result[1] as T | undefined] : [false];
  },
  /**
   * Associates `value` with `key`, optionally expiring at an absolute `Date`,
   * `relativeToNowMs` milliseconds from now, or when an `IChangeToken` fires.
   */
  set<T>(cache: IMemoryCache,
    ...rest: [key: unknown, value: T] | [key: unknown, value: T, absoluteExpiration: Date] | [key: unknown, value: T,
      relativeToNowMs: number] | [key: unknown, value: T, expirationToken: IChangeToken]): T
  {
    const [key, value, expiration] = rest;
    // Dispose in `finally`: a throw between creation and commit must still
    // dispose the entry -- an undisposed entry would wedge the linked-entry
    // tracking chain, and disposing without a value set abandons it without
    // committing.
    const entry = cache.createEntry(key);
    try {
      if (expiration instanceof Date) {
        entry.absoluteExpiration = expiration;
      } else if (typeof expiration === 'number') {
        entry.absoluteExpirationRelativeToNow = expiration;
      } else if (isChangeToken(expiration)) {
        entry.expirationTokens.push(expiration);
      }
      entry.value = value;
    } finally {
      entry[Symbol.dispose]();
    }
    return value;
  },
  /**
   * Returns the value at `key` if present; otherwise runs `factory` to produce
   * one, stores it, and returns it. `factory` receives the fresh
   * {@link ICacheEntry} so it can set expiration/size before the value commits.
   */
  getOrCreate<T>(cache: IMemoryCache, key: unknown, factory: Func<[ICacheEntry], T>): T | undefined {
    const result = cache.tryGetValue(key);
    if (result[0]) {
      return result[1] as T | undefined;
    }
    // Dispose in `finally` -- see `set`.
    const entry = cache.createEntry(key);
    let value: T;
    try {
      value = factory(entry);
      entry.value = value;
    } finally {
      entry[Symbol.dispose]();
    }
    return value;
  },
  /**
   * Async {@link CacheExtensions.getOrCreate}: awaits `factory` when the key is absent.
   */
  async getOrCreateAsync<T>(cache: IMemoryCache, key: unknown,
    factory: Func<[ICacheEntry], Promise<T>>): Promise<T | undefined>
  {
    const result = cache.tryGetValue(key);
    if (result[0]) {
      return result[1] as T | undefined;
    }
    // Dispose in `finally` -- see `set`.
    const entry = cache.createEntry(key);
    let value: T;
    try {
      value = await factory(entry);
      entry.value = value;
    } finally {
      entry[Symbol.dispose]();
    }
    return value;
  },
  /** Sets `value` at `key`, applying `options` to the entry. */
  setWithOptions<T>(cache: IMemoryCache, key: unknown, value: T, options?: MemoryCacheEntryOptions): T {
    // Dispose in `finally` -- see `set`.
    const entry = cache.createEntry(key);
    try {
      if (options !== undefined) {
        CacheEntryExtensions.setOptions(entry, options);
      }
      entry.value = value;
    } finally {
      entry[Symbol.dispose]();
    }
    return value;
  },
  /**
   * {@link CacheExtensions.getOrCreate} with `createOptions` applied to the fresh entry before
   * the factory runs.
   */
  getOrCreateWithOptions<T>(cache: IMemoryCache, key: unknown, factory: Func<[ICacheEntry], T>,
    createOptions?: MemoryCacheEntryOptions): T | undefined
  {
    const result = cache.tryGetValue(key);
    if (result[0]) {
      return result[1] as T | undefined;
    }
    // Dispose in `finally` -- see `set`.
    const entry = cache.createEntry(key);
    let value: T;
    try {
      if (createOptions !== undefined) {
        CacheEntryExtensions.setOptions(entry, createOptions);
      }
      value = factory(entry);
      entry.value = value;
    } finally {
      entry[Symbol.dispose]();
    }
    return value;
  },
  /** Async {@link CacheExtensions.getOrCreateWithOptions}. */
  async getOrCreateAsyncWithOptions<T>(cache: IMemoryCache, key: unknown, factory: Func<[ICacheEntry], Promise<T>>,
    createOptions?: MemoryCacheEntryOptions): Promise<T | undefined>
  {
    const result = cache.tryGetValue(key);
    if (result[0]) {
      return result[1] as T | undefined;
    }
    // Dispose in `finally` -- see `set`.
    const entry = cache.createEntry(key);
    let value: T;
    try {
      if (createOptions !== undefined) {
        CacheEntryExtensions.setOptions(entry, createOptions);
      }
      value = await factory(entry);
      entry.value = value;
    } finally {
      entry[Symbol.dispose]();
    }
    return value;
  },
} satisfies AugmentationSet<IMemoryCache>;

// `tryGetValue` is absent here: it shares its name with the IMemoryCache
// primitive, so TS forbids merging a value-typed convenience overload onto it
// (TS2430). The primitive's own `tryGetValue(key)` already covers the method
// form (runtime-identical -- the wrapper only re-casts the tuple's value
// type); a value-typed read uses the standalone `tryGetValue<T>`.
declare module './IMemoryCache' {
  interface IMemoryCache {
    get<T = unknown>(key: unknown): T | undefined;
    set<T>(key: unknown, value: T): T;
    set<T>(key: unknown, value: T, absoluteExpiration: Date): T;
    set<T>(key: unknown, value: T, relativeToNowMs: number): T;
    set<T>(key: unknown, value: T, expirationToken: IChangeToken): T;
    getOrCreate<T>(key: unknown, factory: Func<[ICacheEntry], T>): T | undefined;
    getOrCreateAsync<T>(key: unknown, factory: Func<[ICacheEntry], Promise<T>>): Promise<T | undefined>;
    setWithOptions<T>(key: unknown, value: T, options?: MemoryCacheEntryOptions): T;
    getOrCreateWithOptions<T>(key: unknown, factory: Func<[ICacheEntry], T>, createOptions?: MemoryCacheEntryOptions): T
      | undefined;
    getOrCreateAsyncWithOptions<T>(key: unknown, factory: Func<[ICacheEntry], Promise<T>>,
      createOptions?: MemoryCacheEntryOptions): Promise<T | undefined>;
  }
}

// `tryGetValue` shares its name with IMemoryCache's own primitive, so the set
// installs with a merge strategy that routes to the primitive instead of the
// wrapper: both take just `key` and return the `[found, value]` tuple (the
// wrapper only re-casts the value type), and routing to the primitive avoids
// the mounted method recursing into itself via `cache.tryGetValue(key)`.
const cacheMerge = { tryGetValue(original, _extension) {
  return function(this: IMemoryCache, ...args: unknown[]) {
    return original.call(this, ...args);
  };
} } satisfies MergeStrategies;
registerAugmentations(tokenfor<IMemoryCache>(), CacheExtensions, cacheMerge);
