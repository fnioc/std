// Fluent methods on MemoryCacheEntryOptions -- set priority/size/expiration and
// register post-eviction callbacks -- dot-callable on any options bag. Each
// returns it for chaining, so one reusable bag can be built fluently and applied
// to many entries via `CacheEntrySugarAugmentations.setOptions`.

import { applyAugmentations, type IChangeToken } from '@rhombus-std/primitives';
import type { Flatten } from '@rhombus-toolkit/type-helpers';
import type { CacheItemPriority } from './CacheItemPriority';
import { MemoryCacheEntryOptions } from './MemoryCacheEntryOptions';
import { PostEvictionCallbackRegistration } from './PostEvictionCallbackRegistration';
import type { PostEvictionDelegate } from './PostEvictionDelegate';

export namespace MemoryCacheEntryOptionsSugarAugmentations {
  /** Sets the compaction {@link CacheItemPriority} the bag applies to an entry. */
  export function setPriority(this: MemoryCacheEntryOptions, priority: CacheItemPriority): MemoryCacheEntryOptions {
    this.priority = priority;
    return this;
  }

  /** Sets the entry-value size the bag applies. Throws if `size` is negative. */
  export function setSize(this: MemoryCacheEntryOptions, size: number): MemoryCacheEntryOptions {
    this.size = size;
    return this;
  }

  /** Expires the entry the bag is applied to when `expirationToken` fires. */
  export function addExpirationToken(this: MemoryCacheEntryOptions,
    expirationToken: IChangeToken): MemoryCacheEntryOptions {
    this.expirationTokens.push(expirationToken);
    return this;
  }

  /** Sets an absolute expiration -- a number of milliseconds from now, or an absolute `Date`. */
  export function setAbsoluteExpiration(this: MemoryCacheEntryOptions,
    expiration: number | Date): MemoryCacheEntryOptions {
    if (expiration instanceof Date) {
      this.absoluteExpiration = expiration;
    } else {
      this.absoluteExpirationRelativeToNow = expiration;
    }
    return this;
  }

  /** Sets how long (in milliseconds) the entry may be inactive before removal. */
  export function setSlidingExpiration(this: MemoryCacheEntryOptions, offsetMs: number): MemoryCacheEntryOptions {
    this.slidingExpiration = offsetMs;
    return this;
  }

  /** Registers a callback fired after the entry the bag is applied to is evicted. */
  export function registerPostEvictionCallback(this: MemoryCacheEntryOptions, callback: PostEvictionDelegate,
    state?: unknown): MemoryCacheEntryOptions {
    const registration = new PostEvictionCallbackRegistration();
    registration.evictionCallback = callback;
    registration.state = state;
    this.postEvictionCallbacks.push(registration);
    return this;
  }
}

declare module '@rhombus-std/caching.core' {
  interface MemoryCacheEntryOptions extends Flatten<typeof MemoryCacheEntryOptionsSugarAugmentations> {}
}

applyAugmentations(MemoryCacheEntryOptions, MemoryCacheEntryOptionsSugarAugmentations);
