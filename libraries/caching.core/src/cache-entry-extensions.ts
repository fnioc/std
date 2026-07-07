// The ICacheEntry convenience wrappers, ported from ME.Caching.Abstractions'
// static `CacheEntryExtensions` class. Plain exported functions taking the
// entry first (the family owns `ICacheEntry`, so no augmentation -- explicit
// form is primary). Each returns the entry for chaining.
//
// `SetAbsoluteExpiration`'s two overloads (TimeSpan relative / DateTimeOffset
// absolute) collapse into one `setAbsoluteExpiration` discriminated by
// `number` (ms relative) vs `Date` (absolute). The `SetOptions` helper needs
// `MemoryCacheEntryOptions` and so lives in @rhombus-std/caching.memory.

import type { IChangeToken } from "@rhombus-std/primitives";
import type { ICacheEntry } from "./cache-entry";
import type { CacheItemPriority } from "./cache-item-priority";
import { PostEvictionCallbackRegistration } from "./post-eviction-callback-registration";
import type { PostEvictionDelegate } from "./post-eviction-delegate";

/** Sets the entry's compaction {@link CacheItemPriority}. */
export function setPriority(entry: ICacheEntry, priority: CacheItemPriority): ICacheEntry {
  entry.priority = priority;
  return entry;
}

/** Expires the entry when `expirationToken` fires. */
export function addExpirationToken(entry: ICacheEntry, expirationToken: IChangeToken): ICacheEntry {
  entry.expirationTokens.push(expirationToken);
  return entry;
}

/** Sets an absolute expiration `relativeToNowMs` milliseconds from now. */
export function setAbsoluteExpiration(entry: ICacheEntry, relativeToNowMs: number): ICacheEntry;
/** Sets an absolute expiration `Date`. */
export function setAbsoluteExpiration(entry: ICacheEntry, absolute: Date): ICacheEntry;
export function setAbsoluteExpiration(entry: ICacheEntry, value: number | Date): ICacheEntry {
  if (value instanceof Date) {
    entry.absoluteExpiration = value;
  } else {
    entry.absoluteExpirationRelativeToNow = value;
  }
  return entry;
}

/** Sets how long (in milliseconds) the entry may be inactive before removal. */
export function setSlidingExpiration(entry: ICacheEntry, offsetMs: number): ICacheEntry {
  entry.slidingExpiration = offsetMs;
  return entry;
}

/** Registers a callback fired after the entry is evicted. */
export function registerPostEvictionCallback(
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
export function setValue(entry: ICacheEntry, value: unknown): ICacheEntry {
  entry.value = value;
  return entry;
}

/** Sets the entry's size. Throws if `size` is negative. */
export function setSize(entry: ICacheEntry, size: number): ICacheEntry {
  if (size < 0) {
    throw new RangeError(`size must be non-negative, was ${size}.`);
  }
  entry.size = size;
  return entry;
}
