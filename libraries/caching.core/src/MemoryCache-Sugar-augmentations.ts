// Convenience reads and writes over the three `IMemoryCache` primitives
// (`tryGetValue`/`createEntry`/`remove`).
//
// `set` and `getOrCreate` discriminate their expiration argument by runtime
// type: a `Date` is absolute, a `number` is milliseconds from now, an
// `IChangeToken` expires on signal. A `MemoryCacheEntryOptions` bag is not
// distinguishable from those at runtime, so the forms that take one get their
// own member names (`setWithOptions`, `getOrCreateWithOptions`,
// `getOrCreateAsyncWithOptions`) rather than a further argument shape.

import { type AugmentationSet2, type Flatten, type IChangeToken, type MergeStrategies,
  registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { CacheEntrySugarAugmentations } from './CacheEntry-Sugar-augmentations';
import type { ICacheEntry } from './ICacheEntry';
import type { IMemoryCache } from './IMemoryCache';
import type { MemoryCacheEntryOptions } from './MemoryCacheEntryOptions';

/** When the entry expires: an absolute `Date`, milliseconds from now, or on a change token. */
type Expiration = Date | number | IChangeToken;

type IMemoryCacheSugarAugmentations = {
  get<T = unknown>(key: unknown): T | undefined;
  set<T>(key: unknown, value: T, expiration?: Expiration): T;
  getOrCreate<T>(key: unknown, factory: Func<[ICacheEntry], T>): T | undefined;
  getOrCreateAsync<T>(key: unknown, factory: Func<[ICacheEntry], Promise<T>>): Promise<T | undefined>;
  setWithOptions<T>(key: unknown, value: T, options?: MemoryCacheEntryOptions): T;
  getOrCreateWithOptions<T>(key: unknown, factory: Func<[ICacheEntry], T>, createOptions?: MemoryCacheEntryOptions):
    | T
    | undefined;
  getOrCreateAsyncWithOptions<T>(key: unknown, factory: Func<[ICacheEntry], Promise<T>>,
    createOptions?: MemoryCacheEntryOptions): Promise<T | undefined>;
};

/**
 * `tryGetValue` is absent from the merge below: `IMemoryCache` declares a
 * `tryGetValue(key)` primitive of its own, and TS refuses to merge a second
 * declaration of the same name onto an interface (TS2430). The primitive
 * already covers the method form -- this wrapper differs only in re-casting the
 * tuple's value type -- so a value-typed read goes through the standalone
 * member.
 */
type IMemoryCacheStandaloneReads = {
  tryGetValue<T = unknown>(key: unknown): [found: false] | [found: true, value: T | undefined];
};

declare module '@rhombus-std/caching.core' {
  interface IMemoryCache extends IMemoryCacheSugarAugmentations {}
}

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

export const MemoryCacheSugarAugmentations: AugmentationSet2<IMemoryCache,
  Flatten<IMemoryCacheSugarAugmentations & IMemoryCacheStandaloneReads>> = {
    /**
     * Gets the value associated with `key`, or `undefined` if not present. The
     * type parameter is an unchecked cast -- the stored value is not
     * runtime-verified against it.
     */
    get(cache, key) {
      const result = cache.tryGetValue(key);
      return result[0] ? result[1] : undefined;
    },

    /** Tries to get the value associated with `key`: `[true, value]` on a hit, `[false]` on a miss. */
    tryGetValue(cache, key) {
      const result = cache.tryGetValue(key);
      return result[0] ? [true, result[1]] : [false];
    },

    /** Associates `value` with `key`, optionally expiring it per `expiration`. */
    set(cache, key, value, expiration) {
      // Dispose in `finally`: a throw between creation and commit must still
      // dispose the entry -- an undisposed entry would wedge the linked-entry
      // tracking chain, and disposing without a value set abandons it without
      // committing.
      const entry = cache.createEntry(key);
      try {
        applyExpiration(entry, expiration);
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
    getOrCreate(cache, key, factory) {
      const result = cache.tryGetValue(key);
      if (result[0]) {
        return result[1];
      }
      // Dispose in `finally` -- see `set`.
      const entry = cache.createEntry(key);
      let value: unknown;
      try {
        value = factory(entry);
        entry.value = value;
      } finally {
        entry[Symbol.dispose]();
      }
      return value;
    },

    /** Async {@link MemoryCacheSugarAugmentations.getOrCreate}: awaits `factory` when the key is absent. */
    async getOrCreateAsync(cache, key, factory) {
      const result = cache.tryGetValue(key);
      if (result[0]) {
        return result[1];
      }
      // Dispose in `finally` -- see `set`.
      const entry = cache.createEntry(key);
      let value: unknown;
      try {
        value = await factory(entry);
        entry.value = value;
      } finally {
        entry[Symbol.dispose]();
      }
      return value;
    },

    /** Sets `value` at `key`, applying `options` to the entry. */
    setWithOptions(cache, key, value, options) {
      // Dispose in `finally` -- see `set`.
      const entry = cache.createEntry(key);
      try {
        if (options !== undefined) {
          CacheEntrySugarAugmentations.setOptions(entry, options);
        }
        entry.value = value;
      } finally {
        entry[Symbol.dispose]();
      }
      return value;
    },

    /**
     * {@link MemoryCacheSugarAugmentations.getOrCreate} with `createOptions` applied to the fresh
     * entry before the factory runs.
     */
    getOrCreateWithOptions(cache, key, factory, createOptions) {
      const result = cache.tryGetValue(key);
      if (result[0]) {
        return result[1];
      }
      // Dispose in `finally` -- see `set`.
      const entry = cache.createEntry(key);
      let value: unknown;
      try {
        if (createOptions !== undefined) {
          CacheEntrySugarAugmentations.setOptions(entry, createOptions);
        }
        value = factory(entry);
        entry.value = value;
      } finally {
        entry[Symbol.dispose]();
      }
      return value;
    },

    /** Async {@link MemoryCacheSugarAugmentations.getOrCreateWithOptions}. */
    async getOrCreateAsyncWithOptions(cache, key, factory, createOptions) {
      const result = cache.tryGetValue(key);
      if (result[0]) {
        return result[1];
      }
      // Dispose in `finally` -- see `set`.
      const entry = cache.createEntry(key);
      let value: unknown;
      try {
        if (createOptions !== undefined) {
          CacheEntrySugarAugmentations.setOptions(entry, createOptions);
        }
        value = await factory(entry);
        entry.value = value;
      } finally {
        entry[Symbol.dispose]();
      }
      return value;
    },
  };

// `tryGetValue` lands on a name the receiver's own primitive already holds, so
// it installs with a strategy that routes every call to the primitive: both
// take just `key` and return the `[found, value]` tuple, and routing to the
// primitive keeps the mounted method from recursing into itself.
const cacheMerge = { tryGetValue(original, _extension) {
  return function(this: IMemoryCache, ...args: unknown[]) {
    return original.call(this, ...args);
  };
} } satisfies MergeStrategies;

registerAugmentations(tokenfor<IMemoryCache>(), MemoryCacheSugarAugmentations, cacheMerge);
