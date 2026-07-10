// The IMemoryCache convenience wrappers, ported from ME.Caching.Abstractions'
// static `CacheExtensions` class -- authored as the named `CacheExtensions`
// augmentation object literal (docs §28/§38), one member per reference static
// method, receiver-first. The members build only on the three core
// `IMemoryCache` members (`tryGetValue`/`createEntry`/`remove`). `tryGetValue`
// is a member of the literal but is NOT prototype-installed (see
// caching.memory's cache-augmentations.ts).
//
// Collapsing the reference overloads:
//   - `Get` and `Get<TItem>` collapse into one generic `get<T>` (TS cannot
//     dispatch on a type argument at runtime, so the typed and untyped forms
//     are the same call with a differing cast).
//   - `Set<TItem>`'s four value-type overloads (DateTimeOffset / TimeSpan /
//     IChangeToken / bare) collapse into one `set` with a discriminated
//     `expiration` union -- `Date` -> absolute, `number` (ms) -> relative,
//     an `IChangeToken` -> expiration token.
//
// The `MemoryCacheEntryOptions`-consuming overloads (reference `Set(options)`
// and `GetOrCreate(createOptions)`) are kept under distinct member names
// (`setWithOptions`/`getOrCreateWithOptions`/`getOrCreateAsyncWithOptions`,
// since a `MemoryCacheEntryOptions` bag isn't runtime-distinguishable from the
// `Date`/`number`/`IChangeToken` expiration argument `set`/`getOrCreate` already
// discriminate on -- a distinct member name is clearer than another overload,
// docs §42) and folded into this same `CacheExtensions` const --
// `MemoryCacheEntryOptions` now lives in caching.core (as ME has it), so the
// options TYPE is in scope here.

import type { AugmentationSet, IChangeToken } from "@rhombus-std/primitives";
import { registerAugmentations } from "@rhombus-std/primitives";
import { nameof } from "@rhombus-std/primitives.transformer/internal/nameof";
import { CacheEntryExtensions } from "./cache-entry-augmentations";
import type { ICacheEntry } from "./ICacheEntry";
import type { IMemoryCache } from "./memory-cache";
import type { MemoryCacheEntryOptions } from "./MemoryCacheEntryOptions";

/** Narrows the `expiration` union: an `IChangeToken` (not a `Date`/`number`). */
function isChangeToken(value: unknown): value is IChangeToken {
  return typeof value === "object"
    && value !== null
    && typeof (value as IChangeToken).registerChangeCallback === "function";
}

/** The `CacheExtensions` augmentation set for {@link IMemoryCache} (docs §28/§38). */
export const CacheExtensions = {
  /**
   * Gets the value associated with `key`, or `undefined` if not present. The
   * type parameter is an unchecked cast of the stored value (mirrors the
   * reference `Get<TItem>`, which likewise does not runtime-verify the type).
   */
  get<T = unknown>(cache: IMemoryCache, key: unknown): T | undefined {
    const result = cache.tryGetValue(key);
    return result[0] ? (result[1] as T | undefined) : undefined;
  },
  /**
   * Tries to get the value associated with `key`. Returns `[true, value]` on a
   * hit (value cast to `T`), `[false]` on a miss.
   */
  tryGetValue<T = unknown>(
    cache: IMemoryCache,
    key: unknown,
  ): [found: false] | [found: true, value: T | undefined] {
    const result = cache.tryGetValue(key);
    return result[0] ? [true, result[1] as T | undefined] : [false];
  },
  /**
   * Associates `value` with `key`, optionally expiring at an absolute `Date`,
   * `relativeToNowMs` milliseconds from now, or when an `IChangeToken` fires.
   */
  set<T>(
    cache: IMemoryCache,
    ...rest:
      | [key: unknown, value: T]
      | [key: unknown, value: T, absoluteExpiration: Date]
      | [key: unknown, value: T, relativeToNowMs: number]
      | [key: unknown, value: T, expirationToken: IChangeToken]
  ): T {
    const [key, value, expiration] = rest;
    const entry = cache.createEntry(key);
    if (expiration instanceof Date) {
      entry.absoluteExpiration = expiration;
    } else if (typeof expiration === "number") {
      entry.absoluteExpirationRelativeToNow = expiration;
    } else if (isChangeToken(expiration)) {
      entry.expirationTokens.push(expiration);
    }
    entry.value = value;
    entry[Symbol.dispose]();
    return value;
  },
  /**
   * Returns the value at `key` if present; otherwise runs `factory` to produce
   * one, stores it, and returns it. `factory` receives the fresh
   * {@link ICacheEntry} so it can set expiration/size before the value commits.
   */
  getOrCreate<T>(
    cache: IMemoryCache,
    key: unknown,
    factory: (entry: ICacheEntry) => T,
  ): T | undefined {
    const result = cache.tryGetValue(key);
    if (result[0]) {
      return result[1] as T | undefined;
    }
    const entry = cache.createEntry(key);
    const value = factory(entry);
    entry.value = value;
    entry[Symbol.dispose]();
    return value;
  },
  /**
   * Async {@link CacheExtensions.getOrCreate}: awaits `factory` when the key is absent.
   */
  async getOrCreateAsync<T>(
    cache: IMemoryCache,
    key: unknown,
    factory: (entry: ICacheEntry) => Promise<T>,
  ): Promise<T | undefined> {
    const result = cache.tryGetValue(key);
    if (result[0]) {
      return result[1] as T | undefined;
    }
    const entry = cache.createEntry(key);
    const value = await factory(entry);
    entry.value = value;
    entry[Symbol.dispose]();
    return value;
  },
  /** Sets `value` at `key`, applying `options` to the entry (the `Set(options)` port). */
  setWithOptions<T>(
    cache: IMemoryCache,
    key: unknown,
    value: T,
    options?: MemoryCacheEntryOptions,
  ): T {
    const entry = cache.createEntry(key);
    if (options !== undefined) {
      CacheEntryExtensions.setOptions(entry, options);
    }
    entry.value = value;
    entry[Symbol.dispose]();
    return value;
  },
  /**
   * {@link CacheExtensions.getOrCreate} with `createOptions` applied to the fresh entry before
   * the factory runs (the `GetOrCreate(createOptions)` port).
   */
  getOrCreateWithOptions<T>(
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
      CacheEntryExtensions.setOptions(entry, createOptions);
    }
    const value = factory(entry);
    entry.value = value;
    entry[Symbol.dispose]();
    return value;
  },
  /** Async {@link CacheExtensions.getOrCreateWithOptions}. */
  async getOrCreateAsyncWithOptions<T>(
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
      CacheEntryExtensions.setOptions(entry, createOptions);
    }
    const value = await factory(entry);
    entry.value = value;
    entry[Symbol.dispose]();
    return value;
  },
} satisfies AugmentationSet<IMemoryCache>;

// The method-form surface merged onto IMemoryCache (docs §28/§38): the concrete
// MemoryCache downstream is decorated `@augment(nameof<IMemoryCache>())` and pulls
// these onto its prototype. `tryGetValue` is absent -- IMemoryCache already
// declares it (the primitive the wrapper builds on); see the registration below.
declare module "./memory-cache" {
  interface IMemoryCache {
    get<T = unknown>(key: unknown): T | undefined;
    set<T>(key: unknown, value: T): T;
    set<T>(key: unknown, value: T, absoluteExpiration: Date): T;
    set<T>(key: unknown, value: T, relativeToNowMs: number): T;
    set<T>(key: unknown, value: T, expirationToken: IChangeToken): T;
    getOrCreate<T>(key: unknown, factory: (entry: ICacheEntry) => T): T | undefined;
    getOrCreateAsync<T>(key: unknown, factory: (entry: ICacheEntry) => Promise<T>): Promise<T | undefined>;
    setWithOptions<T>(key: unknown, value: T, options?: MemoryCacheEntryOptions): T;
    getOrCreateWithOptions<T>(
      key: unknown,
      factory: (entry: ICacheEntry) => T,
      createOptions?: MemoryCacheEntryOptions,
    ): T | undefined;
    getOrCreateAsyncWithOptions<T>(
      key: unknown,
      factory: (entry: ICacheEntry) => Promise<T>,
      createOptions?: MemoryCacheEntryOptions,
    ): Promise<T | undefined>;
  }
}

// Self-registration for the OPEN `IMemoryCache` receiver (docs §38). `tryGetValue`
// is a member of `CacheExtensions` (its standalone surface) but is deliberately
// NOT prototype-installed: IMemoryCache already declares the `tryGetValue`
// primitive the wrapper builds on, so installing it would overwrite the real
// implementation and the mounted thunk would recurse into itself. Omit it via a
// rest destructure (TS exempts the rest-sibling from unused checks).
const { tryGetValue: _tryGetValue, ...cacheInstanceMethods } = CacheExtensions;
registerAugmentations(nameof<IMemoryCache>(), cacheInstanceMethods);
