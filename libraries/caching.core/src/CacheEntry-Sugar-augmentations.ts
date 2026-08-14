import { type Flatten, type IChangeToken } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { CacheItemPriority } from './CacheItemPriority';
import type { ICacheEntry } from './ICacheEntry';
import type { MemoryCacheEntryOptions } from './MemoryCacheEntryOptions';
import { PostEvictionCallbackRegistration } from './PostEvictionCallbackRegistration';
import type { PostEvictionDelegate } from './PostEvictionDelegate';

export namespace CacheEntrySugarAugmentations {
  /** Sets the entry's compaction {@link CacheItemPriority}. */
  export function setPriority<Self extends ICacheEntry>(this: Self, priority: CacheItemPriority): Self {
    this.priority = priority;
    return this;
  }

  /** Expires the entry when `expirationToken` fires. */
  export function addExpirationToken<Self extends ICacheEntry>(this: Self, expirationToken: IChangeToken): Self {
    this.expirationTokens.push(expirationToken);
    return this;
  }

  /** Sets an absolute expiration -- a number of milliseconds from now, or an absolute `Date`. */
  export function setAbsoluteExpiration<Self extends ICacheEntry>(this: Self, expiration: number | Date): Self {
    if (expiration instanceof Date) {
      this.absoluteExpiration = expiration;
    } else {
      this.absoluteExpirationRelativeToNow = expiration;
    }
    return this;
  }

  /** Sets how long (in milliseconds) the entry may be inactive before removal. */
  export function setSlidingExpiration<Self extends ICacheEntry>(this: Self, offsetMs: number): Self {
    this.slidingExpiration = offsetMs;
    return this;
  }

  /** Registers a callback fired after the entry is evicted. */
  export function registerPostEvictionCallback<Self extends ICacheEntry>(this: Self, callback: PostEvictionDelegate,
    state?: unknown): Self {
    const registration = new PostEvictionCallbackRegistration();
    registration.evictionCallback = callback;
    registration.state = state;
    this.postEvictionCallbacks.push(registration);
    return this;
  }

  /** Sets the entry's value. */
  export function setValue<Self extends ICacheEntry>(this: Self, value: unknown): Self {
    this.value = value;
    return this;
  }

  /** Sets the entry's size. Throws if `size` is negative. */
  export function setSize<Self extends ICacheEntry>(this: Self, size: number): Self {
    if (size < 0) {
      throw new RangeError(`size must be non-negative, was ${size}.`);
    }
    this.size = size;
    return this;
  }

  /** Applies every value of `options` to the entry. Throws if `options` carries a post-eviction registration with no callback. */
  export function setOptions<Self extends ICacheEntry>(this: Self, options: MemoryCacheEntryOptions): Self {
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
  }
}

declare module '@rhombus-std/caching.core' {
  interface ICacheEntry extends Flatten<typeof CacheEntrySugarAugmentations> {}
}

registerAugmentations<ICacheEntry>(CacheEntrySugarAugmentations);
