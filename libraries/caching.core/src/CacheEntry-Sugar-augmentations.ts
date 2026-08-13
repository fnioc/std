import type { AugmentationSet2, Flatten, IChangeToken } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
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
  setPriority(priority) {
    this.priority = priority;
    return this;
  },

  /** Expires the entry when `expirationToken` fires. */
  addExpirationToken(expirationToken) {
    this.expirationTokens.push(expirationToken);
    return this;
  },

  /** Sets an absolute expiration -- a number of milliseconds from now, or an absolute `Date`. */
  setAbsoluteExpiration(expiration) {
    if (expiration instanceof Date) {
      this.absoluteExpiration = expiration;
    } else {
      this.absoluteExpirationRelativeToNow = expiration;
    }
    return this;
  },

  /** Sets how long (in milliseconds) the entry may be inactive before removal. */
  setSlidingExpiration(offsetMs) {
    this.slidingExpiration = offsetMs;
    return this;
  },

  /** Registers a callback fired after the entry is evicted. */
  registerPostEvictionCallback(callback, state) {
    const registration = new PostEvictionCallbackRegistration();
    registration.evictionCallback = callback;
    registration.state = state;
    this.postEvictionCallbacks.push(registration);
    return this;
  },

  /** Sets the entry's value. */
  setValue(value) {
    this.value = value;
    return this;
  },

  /** Sets the entry's size. Throws if `size` is negative. */
  setSize(size) {
    if (size < 0) {
      throw new RangeError(`size must be non-negative, was ${size}.`);
    }
    this.size = size;
    return this;
  },

  /** Applies every value of `options` to the entry. Throws if `options` carries a post-eviction registration with no callback. */
  setOptions(options) {
    this.absoluteExpiration = options.absoluteExpiration;
    this.absoluteExpirationRelativeToNow = options.absoluteExpirationRelativeToNow;
    this.slidingExpiration = options.slidingExpiration;
    this.priority = options.priority;
    this.size = options.size;

    const expirationTokens = options.expirationTokensDirect;
    if (expirationTokens !== undefined) {
      for (const token of expirationTokens) {
        CacheEntrySugarAugmentations.addExpirationToken.call(this, token);
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
        this.postEvictionCallbacks.push(registration);
      }
    }

    return this;
  },
};

registerAugmentations<ICacheEntry>(CacheEntrySugarAugmentations);
