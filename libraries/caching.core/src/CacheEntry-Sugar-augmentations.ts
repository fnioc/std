import { type AugmentationSet2, type Flatten, type IChangeToken, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { CacheItemPriority } from './CacheItemPriority';
import type { ICacheEntry } from './ICacheEntry';
import type { MemoryCacheEntryOptions } from './MemoryCacheEntryOptions';
import { PostEvictionCallbackRegistration } from './PostEvictionCallbackRegistration';
import type { PostEvictionDelegate } from './PostEvictionDelegate';

interface ICacheEntrySugarAugmentations {
  setPriority(priority: CacheItemPriority): this;
  addExpirationToken(expirationToken: IChangeToken): this;
  setAbsoluteExpiration(expiration: number | Date): this;
  setSlidingExpiration(offsetMs: number): this;
  registerPostEvictionCallback(callback: PostEvictionDelegate, state?: unknown): this;
  setValue(value: unknown): this;
  setSize(size: number): this;
  setOptions(options: MemoryCacheEntryOptions): this;
}

declare module '@rhombus-std/caching.core' {
  interface ICacheEntry extends ICacheEntrySugarAugmentations {}
}

export const CacheEntrySugarAugmentations: AugmentationSet2<ICacheEntry, Flatten<ICacheEntrySugarAugmentations>> = {
  /** Sets the entry's compaction {@link CacheItemPriority}. */
  setPriority(entry, priority) {
    entry.priority = priority;
    return entry;
  },

  /** Expires the entry when `expirationToken` fires. */
  addExpirationToken(entry, expirationToken) {
    entry.expirationTokens.push(expirationToken);
    return entry;
  },

  /** Sets an absolute expiration -- a number of milliseconds from now, or an absolute `Date`. */
  setAbsoluteExpiration(entry, expiration) {
    if (expiration instanceof Date) {
      entry.absoluteExpiration = expiration;
    } else {
      entry.absoluteExpirationRelativeToNow = expiration;
    }
    return entry;
  },

  /** Sets how long (in milliseconds) the entry may be inactive before removal. */
  setSlidingExpiration(entry, offsetMs) {
    entry.slidingExpiration = offsetMs;
    return entry;
  },

  /** Registers a callback fired after the entry is evicted. */
  registerPostEvictionCallback(entry, callback, state) {
    const registration = new PostEvictionCallbackRegistration();
    registration.evictionCallback = callback;
    registration.state = state;
    entry.postEvictionCallbacks.push(registration);
    return entry;
  },

  /** Sets the entry's value. */
  setValue(entry, value) {
    entry.value = value;
    return entry;
  },

  /** Sets the entry's size. Throws if `size` is negative. */
  setSize(entry, size) {
    if (size < 0) {
      throw new RangeError(`size must be non-negative, was ${size}.`);
    }
    entry.size = size;
    return entry;
  },

  /** Applies every value of `options` to `entry`. Throws if `options` carries a post-eviction registration with no callback. */
  setOptions(entry, options) {
    entry.absoluteExpiration = options.absoluteExpiration;
    entry.absoluteExpirationRelativeToNow = options.absoluteExpirationRelativeToNow;
    entry.slidingExpiration = options.slidingExpiration;
    entry.priority = options.priority;
    entry.size = options.size;

    const expirationTokens = options.expirationTokensDirect;
    if (expirationTokens !== undefined) {
      for (const token of expirationTokens) {
        CacheEntrySugarAugmentations.addExpirationToken(entry, token);
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
  },
};

registerAugmentations(tokenfor<ICacheEntry>(), CacheEntrySugarAugmentations);
