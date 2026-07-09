// The ICacheEntry convenience wrappers, ported from ME.Caching.Abstractions'
// static `CacheEntryExtensions` class -- authored as the named
// `CacheEntryExtensions` augmentation object literal (docs §28/§38), one member
// per reference static method, receiver-first. Each returns the entry for
// chaining.
//
// `SetAbsoluteExpiration`'s two overloads (TimeSpan relative / DateTimeOffset
// absolute) collapse into one `setAbsoluteExpiration` discriminated by
// `number` (ms relative) vs `Date` (absolute). `setOptions` (ME `SetOptions`)
// applies a whole `MemoryCacheEntryOptions` bag -- that TYPE now lives in
// caching.core (as ME has it), so the helper is here rather than downstream.

import type { AugmentationSet, IChangeToken } from "@rhombus-std/primitives";
import { registerAugmentations } from "@rhombus-std/primitives";
import { nameof } from "@rhombus-std/primitives.transformer/internal/nameof";
import type { ICacheEntry } from "./cache-entry";
import type { CacheItemPriority } from "./cache-item-priority";
import type { MemoryCacheEntryOptions } from "./memory-cache-entry-options";
import { PostEvictionCallbackRegistration } from "./post-eviction-callback-registration";
import type { PostEvictionDelegate } from "./post-eviction-delegate";

/** Sets the entry's compaction {@link CacheItemPriority}. */
function setPriority(entry: ICacheEntry, priority: CacheItemPriority): ICacheEntry {
  entry.priority = priority;
  return entry;
}

/** Expires the entry when `expirationToken` fires. */
function addExpirationToken(entry: ICacheEntry, expirationToken: IChangeToken): ICacheEntry {
  entry.expirationTokens.push(expirationToken);
  return entry;
}

/** Sets an absolute expiration `relativeToNowMs` milliseconds from now. */
function setAbsoluteExpiration(entry: ICacheEntry, relativeToNowMs: number): ICacheEntry;
/** Sets an absolute expiration `Date`. */
function setAbsoluteExpiration(entry: ICacheEntry, absolute: Date): ICacheEntry;
function setAbsoluteExpiration(entry: ICacheEntry, value: number | Date): ICacheEntry {
  if (value instanceof Date) {
    entry.absoluteExpiration = value;
  } else {
    entry.absoluteExpirationRelativeToNow = value;
  }
  return entry;
}

/** Sets how long (in milliseconds) the entry may be inactive before removal. */
function setSlidingExpiration(entry: ICacheEntry, offsetMs: number): ICacheEntry {
  entry.slidingExpiration = offsetMs;
  return entry;
}

/** Registers a callback fired after the entry is evicted. */
function registerPostEvictionCallback(
  entry: ICacheEntry,
  callback: PostEvictionDelegate,
  state?: unknown,
): ICacheEntry {
  const registration = new PostEvictionCallbackRegistration();
  registration.evictionCallback = callback;
  registration.state = state;
  entry.postEvictionCallbacks.push(registration);
  return entry;
}

/** Sets the entry's value. */
function setValue(entry: ICacheEntry, value: unknown): ICacheEntry {
  entry.value = value;
  return entry;
}

/** Sets the entry's size. Throws if `size` is negative. */
function setSize(entry: ICacheEntry, size: number): ICacheEntry {
  if (size < 0) {
    throw new RangeError(`size must be non-negative, was ${size}.`);
  }
  entry.size = size;
  return entry;
}

/**
 * Applies every value of `options` to `entry` (the `SetOptions` port). Throws
 * if `options` carries a post-eviction registration with no callback.
 */
function setOptions(entry: ICacheEntry, options: MemoryCacheEntryOptions): ICacheEntry {
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

/** The `CacheEntryExtensions` augmentation set for {@link ICacheEntry} (docs §28/§38). */
export const CacheEntryExtensions = {
  setPriority,
  addExpirationToken,
  setAbsoluteExpiration,
  setSlidingExpiration,
  registerPostEvictionCallback,
  setValue,
  setSize,
  setOptions,
} satisfies AugmentationSet<ICacheEntry>;

// The method-form surface merged onto ICacheEntry (docs §28/§38): the concrete
// CacheEntry downstream is decorated `@augment(nameof<ICacheEntry>())` and pulls
// these onto its prototype.
declare module "./cache-entry" {
  interface ICacheEntry {
    setPriority(priority: CacheItemPriority): this;
    addExpirationToken(expirationToken: IChangeToken): this;
    setAbsoluteExpiration(relativeToNowMs: number): this;
    setAbsoluteExpiration(absolute: Date): this;
    setSlidingExpiration(offsetMs: number): this;
    registerPostEvictionCallback(callback: PostEvictionDelegate, state?: unknown): this;
    setValue(value: unknown): this;
    setSize(size: number): this;
    setOptions(options: MemoryCacheEntryOptions): this;
  }
}

// Self-registration for the OPEN `ICacheEntry` receiver (docs §38).
registerAugmentations(nameof<ICacheEntry>(), CacheEntryExtensions);
