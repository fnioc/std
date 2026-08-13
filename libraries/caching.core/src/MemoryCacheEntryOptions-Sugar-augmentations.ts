// Fluent methods on MemoryCacheEntryOptions -- set priority/size/expiration and
// register post-eviction callbacks -- dot-callable on any options bag. Each
// returns it for chaining, so one reusable bag can be built fluently and applied
// to many entries via `CacheEntrySugarAugmentations.setOptions`.

import { applyAugmentations, type AugmentationSet, type IChangeToken } from '@rhombus-std/primitives';
import type { CacheItemPriority } from './CacheItemPriority';
import { MemoryCacheEntryOptions } from './MemoryCacheEntryOptions';
import { PostEvictionCallbackRegistration } from './PostEvictionCallbackRegistration';
import type { PostEvictionDelegate } from './PostEvictionDelegate';

interface IMemoryCacheEntryOptionsSugarAugmentations {
  setPriority(priority: CacheItemPriority): this;
  setSize(size: number): this;
  addExpirationToken(expirationToken: IChangeToken): this;
  setAbsoluteExpiration(expiration: number | Date): this;
  setSlidingExpiration(offsetMs: number): this;
  registerPostEvictionCallback(callback: PostEvictionDelegate, state?: unknown): this;
}

declare module '@rhombus-std/caching.core' {
  interface MemoryCacheEntryOptions extends IMemoryCacheEntryOptionsSugarAugmentations {}
}

export const MemoryCacheEntryOptionsSugarAugmentations = {
  /** Sets the compaction {@link CacheItemPriority} the bag applies to an entry. */
  setPriority(priority: CacheItemPriority): MemoryCacheEntryOptions {
    this.priority = priority;
    return this;
  },

  /** Sets the entry-value size the bag applies. Throws if `size` is negative. */
  setSize(size: number): MemoryCacheEntryOptions {
    this.size = size;
    return this;
  },

  /** Expires the entry the bag is applied to when `expirationToken` fires. */
  addExpirationToken(expirationToken: IChangeToken): MemoryCacheEntryOptions {
    this.expirationTokens.push(expirationToken);
    return this;
  },

  /** Sets an absolute expiration -- a number of milliseconds from now, or an absolute `Date`. */
  setAbsoluteExpiration(expiration: number | Date): MemoryCacheEntryOptions {
    if (expiration instanceof Date) {
      this.absoluteExpiration = expiration;
    } else {
      this.absoluteExpirationRelativeToNow = expiration;
    }
    return this;
  },

  /** Sets how long (in milliseconds) the entry may be inactive before removal. */
  setSlidingExpiration(offsetMs: number): MemoryCacheEntryOptions {
    this.slidingExpiration = offsetMs;
    return this;
  },

  /** Registers a callback fired after the entry the bag is applied to is evicted. */
  registerPostEvictionCallback(callback: PostEvictionDelegate, state?: unknown): MemoryCacheEntryOptions {
    const registration = new PostEvictionCallbackRegistration();
    registration.evictionCallback = callback;
    registration.state = state;
    this.postEvictionCallbacks.push(registration);
    return this;
  },
} satisfies AugmentationSet<MemoryCacheEntryOptions>;

applyAugmentations(MemoryCacheEntryOptions, MemoryCacheEntryOptionsSugarAugmentations);
