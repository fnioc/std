// Fluent methods on MemoryCacheEntryOptions -- set priority/size/expiration and
// register post-eviction callbacks -- dot-callable on any options bag. Each
// returns it for chaining, so one reusable bag can be built fluently and applied
// to many entries via `CacheEntrySugarAugmentations.setOptions`.

import { type AugmentationSet, type IChangeToken } from '@rhombus-std/primitives';
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
  setPriority(options: MemoryCacheEntryOptions, priority: CacheItemPriority): MemoryCacheEntryOptions {
    options.priority = priority;
    return options;
  },

  /** Sets the entry-value size the bag applies. Throws if `size` is negative. */
  setSize(options: MemoryCacheEntryOptions, size: number): MemoryCacheEntryOptions {
    options.size = size;
    return options;
  },

  /** Expires the entry the bag is applied to when `expirationToken` fires. */
  addExpirationToken(options: MemoryCacheEntryOptions, expirationToken: IChangeToken): MemoryCacheEntryOptions {
    options.expirationTokens.push(expirationToken);
    return options;
  },

  /** Sets an absolute expiration -- a number of milliseconds from now, or an absolute `Date`. */
  setAbsoluteExpiration(options: MemoryCacheEntryOptions, expiration: number | Date): MemoryCacheEntryOptions {
    if (expiration instanceof Date) {
      options.absoluteExpiration = expiration;
    } else {
      options.absoluteExpirationRelativeToNow = expiration;
    }
    return options;
  },

  /** Sets how long (in milliseconds) the entry may be inactive before removal. */
  setSlidingExpiration(options: MemoryCacheEntryOptions, offsetMs: number): MemoryCacheEntryOptions {
    options.slidingExpiration = offsetMs;
    return options;
  },

  /** Registers a callback fired after the entry the bag is applied to is evicted. */
  registerPostEvictionCallback(options: MemoryCacheEntryOptions, callback: PostEvictionDelegate,
    state?: unknown): MemoryCacheEntryOptions {
    const registration = new PostEvictionCallbackRegistration();
    registration.evictionCallback = callback;
    registration.state = state;
    options.postEvictionCallbacks.push(registration);
    return options;
  },
} satisfies AugmentationSet<MemoryCacheEntryOptions>;
