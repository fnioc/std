// Convenience reads and writes over the three `IMemoryCache` primitives
// (`tryGetValue`/`createEntry`/`remove`).
//
// `set` and `getOrCreate` discriminate their expiration argument by runtime
// type: a `Date` is absolute, a `number` is milliseconds from now, an
// `IChangeToken` expires on signal. A `MemoryCacheEntryOptions` bag is not
// distinguishable from those at runtime, so the forms that take one get their
// own member names (`setWithOptions`, `getOrCreateWithOptions`,
// `getOrCreateAsyncWithOptions`) rather than a further argument shape.

import { type Flatten, type IChangeToken, type MergeStrategies } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { CacheEntrySugarAugmentations } from './CacheEntry-Sugar-augmentations';
import type { ICacheEntry } from './ICacheEntry';
import type { IMemoryCache } from './IMemoryCache';
import type { MemoryCacheEntryOptions } from './MemoryCacheEntryOptions';

/** When the entry expires: an absolute `Date`, milliseconds from now, or on a change token. */
type Expiration = Date | number | IChangeToken;

/** Narrows the `expiration` union: an `IChangeToken` (not a `Date`/`number`). */
function isChangeToken(value: unknown): value is IChangeToken {
  return typeof value === 'object'
    && value !== null
    && typeof (value as IChangeToken).registerChangeCallback === 'function';
}

/** Applies `expiration` to a fresh entry, if one was supplied. */
function applyExpiration(entry: ICacheEntry, expiration: Expiration | undefined): void {
  if (expiration instanceof Date) {
    entry.absoluteExpiration = expiration;
  } else if (typeof expiration === 'number') {
    entry.absoluteExpirationRelativeToNow = expiration;
  } else if (isChangeToken(expiration)) {
    entry.expirationTokens.push(expiration);
  }
}

export namespace MemoryCacheSugarAugmentations {
  /**
   * Gets the value associated with `key`, or `undefined` if not present. The
   * type parameter is an unchecked cast -- the stored value is not
   * runtime-verified against it.
   */
  export function get<T = unknown>(this: IMemoryCache, key: unknown): T | undefined {
    const result = this.tryGetValue(key);
    return result[0] ? (result[1] as T | undefined) : undefined;
  }

  /**
   * `tryGetValue` shares its name with `IMemoryCache`'s own primitive, so it does
   * not merge through `extends` -- its signature is duplicated directly onto the
   * interface below to form an overload. Installing it goes through a merge
   * strategy that always routes to the primitive: the two are runtime-identical,
   * and this wrapper only re-casts the value type.
   */
  export function tryGetValue<T = unknown>(this: IMemoryCache, key: unknown): [found: false] | [found: true,
    value: T | undefined] {
    const result = this.tryGetValue(key);
    return result[0] ? [true, result[1] as T | undefined] : [false];
  }

  /** Associates `value` with `key`, optionally expiring it per `expiration`. */
  export function set<T>(this: IMemoryCache, key: unknown, value: T, expiration?: Expiration): T {
    // Dispose in `finally`: a throw between creation and commit must still
    // dispose the entry -- an undisposed entry would wedge the linked-entry
    // tracking chain, and disposing without a value set abandons it without
    // committing.
    const entry = this.createEntry(key);
    try {
      applyExpiration(entry, expiration);
      entry.value = value;
    } finally {
      entry[Symbol.dispose]();
    }
    return value;
  }

  /**
   * Returns the value at `key` if present; otherwise runs `factory` to produce
   * one, stores it, and returns it. `factory` receives the fresh
   * {@link ICacheEntry} so it can set expiration/size before the value commits.
   */
  export function getOrCreate<T>(this: IMemoryCache, key: unknown, factory: Func<[ICacheEntry], T>): T | undefined {
    const result = this.tryGetValue(key);
    if (result[0]) {
      return result[1] as T | undefined;
    }
    // Dispose in `finally` -- see `set`.
    const entry = this.createEntry(key);
    let value: T;
    try {
      value = factory(entry);
      entry.value = value;
    } finally {
      entry[Symbol.dispose]();
    }
    return value;
  }

  /** Async {@link MemoryCacheSugarAugmentations.getOrCreate}: awaits `factory` when the key is absent. */
  export async function getOrCreateAsync<T>(this: IMemoryCache, key: unknown,
    factory: Func<[ICacheEntry], Promise<T>>): Promise<T | undefined> {
    const result = this.tryGetValue(key);
    if (result[0]) {
      return result[1] as T | undefined;
    }
    // Dispose in `finally` -- see `set`.
    const entry = this.createEntry(key);
    let value: T;
    try {
      value = await factory(entry);
      entry.value = value;
    } finally {
      entry[Symbol.dispose]();
    }
    return value;
  }

  /** Sets `value` at `key`, applying `options` to the entry. */
  export function setWithOptions<T>(this: IMemoryCache, key: unknown, value: T, options?: MemoryCacheEntryOptions): T {
    // Dispose in `finally` -- see `set`.
    const entry = this.createEntry(key);
    try {
      if (options !== undefined) {
        CacheEntrySugarAugmentations.setOptions.call(entry, options);
      }
      entry.value = value;
    } finally {
      entry[Symbol.dispose]();
    }
    return value;
  }

  /**
   * {@link MemoryCacheSugarAugmentations.getOrCreate} with `createOptions` applied to the fresh
   * entry before the factory runs.
   */
  export function getOrCreateWithOptions<T>(this: IMemoryCache, key: unknown, factory: Func<[ICacheEntry], T>,
    createOptions?: MemoryCacheEntryOptions): T | undefined {
    const result = this.tryGetValue(key);
    if (result[0]) {
      return result[1] as T | undefined;
    }
    // Dispose in `finally` -- see `set`.
    const entry = this.createEntry(key);
    let value: T;
    try {
      if (createOptions !== undefined) {
        CacheEntrySugarAugmentations.setOptions.call(entry, createOptions);
      }
      value = factory(entry);
      entry.value = value;
    } finally {
      entry[Symbol.dispose]();
    }
    return value;
  }

  /** Async {@link MemoryCacheSugarAugmentations.getOrCreateWithOptions}. */
  export async function getOrCreateAsyncWithOptions<T>(this: IMemoryCache, key: unknown,
    factory: Func<[ICacheEntry], Promise<T>>, createOptions?: MemoryCacheEntryOptions): Promise<T | undefined> {
    const result = this.tryGetValue(key);
    if (result[0]) {
      return result[1] as T | undefined;
    }
    // Dispose in `finally` -- see `set`.
    const entry = this.createEntry(key);
    let value: T;
    try {
      if (createOptions !== undefined) {
        CacheEntrySugarAugmentations.setOptions.call(entry, createOptions);
      }
      value = await factory(entry);
      entry.value = value;
    } finally {
      entry[Symbol.dispose]();
    }
    return value;
  }
}

declare module '@rhombus-std/caching.core' {
  interface IMemoryCache extends Flatten<Omit<typeof MemoryCacheSugarAugmentations, 'tryGetValue'>> {
    tryGetValue<T = unknown>(key: unknown): [found: false] | [found: true, value: T | undefined];
  }
}

// `tryGetValue` lands on a name the receiver's own primitive already holds, so
// it installs with a strategy that routes every call to the primitive: both
// take just `key` and return the `[found, value]` tuple, and routing to the
// primitive keeps the mounted method from recursing into itself.
const cacheMerge = { tryGetValue(original, _incoming) {
  return function(this: IMemoryCache, ...args: unknown[]) {
    return original.call(this, ...args);
  };
} } satisfies MergeStrategies<IMemoryCache>;

registerAugmentations<IMemoryCache>(MemoryCacheSugarAugmentations, cacheMerge);
