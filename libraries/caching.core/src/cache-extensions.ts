// The IMemoryCache convenience wrappers, ported from ME.Caching.Abstractions'
// static `CacheExtensions` class.
//
// Per this repo's "explicit form is primary" convention, extension methods
// against an interface THIS family owns (`IMemoryCache`) are plain exported
// functions taking the cache as the first parameter -- no augmentation. They
// build only on the three core members (`tryGetValue`/`createEntry`/`remove`).
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
// The `MemoryCacheEntryOptions`-consuming overloads (`Set(options)`,
// `GetOrCreate(createOptions)`, `SetOptions`) live in
// @rhombus-std/caching.memory, where that options TYPE is defined -- see the
// README note on the abstractions/memory split.

import type { IChangeToken } from "@rhombus-std/primitives";
import type { ICacheEntry } from "./cache-entry";
import type { IMemoryCache } from "./memory-cache";

/** Narrows the `expiration` union: an `IChangeToken` (not a `Date`/`number`). */
function isChangeToken(value: unknown): value is IChangeToken {
  return typeof value === "object"
    && value !== null
    && typeof (value as IChangeToken).registerChangeCallback === "function";
}

/**
 * Gets the value associated with `key`, or `undefined` if not present. The
 * type parameter is an unchecked cast of the stored value (mirrors the
 * reference `Get<TItem>`, which likewise does not runtime-verify the type).
 */
export function get<T = unknown>(cache: IMemoryCache, key: unknown): T | undefined {
  const result = cache.tryGetValue(key);
  return result[0] ? (result[1] as T | undefined) : undefined;
}

/**
 * Tries to get the value associated with `key`. Returns `[true, value]` on a
 * hit (value cast to `T`), `[false]` on a miss.
 */
export function tryGetValue<T = unknown>(
  cache: IMemoryCache,
  key: unknown,
): [found: false] | [found: true, value: T | undefined] {
  const result = cache.tryGetValue(key);
  return result[0] ? [true, result[1] as T | undefined] : [false];
}

/** Associates `value` with `key`. */
export function set<T>(cache: IMemoryCache, key: unknown, value: T): T;
/** Associates `value` with `key`, expiring at the absolute `Date`. */
export function set<T>(cache: IMemoryCache, key: unknown, value: T, absoluteExpiration: Date): T;
/** Associates `value` with `key`, expiring `relativeToNowMs` milliseconds from now. */
export function set<T>(cache: IMemoryCache, key: unknown, value: T, relativeToNowMs: number): T;
/** Associates `value` with `key`, expiring when `expirationToken` fires. */
export function set<T>(cache: IMemoryCache, key: unknown, value: T, expirationToken: IChangeToken): T;
export function set<T>(
  cache: IMemoryCache,
  key: unknown,
  value: T,
  expiration?: Date | number | IChangeToken,
): T {
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
}

/**
 * Returns the value at `key` if present; otherwise runs `factory` to produce
 * one, stores it, and returns it. `factory` receives the fresh
 * {@link ICacheEntry} so it can set expiration/size before the value commits.
 */
export function getOrCreate<T>(
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
}

/**
 * Async {@link getOrCreate}: awaits `factory` when the key is absent.
 */
export async function getOrCreateAsync<T>(
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
}
