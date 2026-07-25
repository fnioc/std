import { type AugmentationSet, type IChangeToken, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { CacheItemPriority } from './CacheItemPriority';
import type { ICacheEntry } from './ICacheEntry';
import type { MemoryCacheEntryOptions } from './MemoryCacheEntryOptions';
import { PostEvictionCallbackRegistration } from './PostEvictionCallbackRegistration';
import type { PostEvictionDelegate } from './PostEvictionDelegate';

/** The `CacheEntryExtensions` augmentation set for {@link ICacheEntry}. */
export const CacheEntryExtensions = {
  /** Sets the entry's compaction {@link CacheItemPriority}. */
  setPriority(entry: ICacheEntry, priority: CacheItemPriority): ICacheEntry {
    entry.priority = priority;
    return entry;
  },

  /** Expires the entry when `expirationToken` fires. */
  addExpirationToken(entry: ICacheEntry, expirationToken: IChangeToken): ICacheEntry {
    entry.expirationTokens.push(expirationToken);
    return entry;
  },

  /** Sets an absolute expiration -- `relativeToNowMs` milliseconds from now, or an absolute `Date`. */
  setAbsoluteExpiration(entry: ICacheEntry, ...rest: [relativeToNowMs: number] | [absolute: Date]): ICacheEntry {
    const [value] = rest;
    if (value instanceof Date) {
      entry.absoluteExpiration = value;
    } else {
      entry.absoluteExpirationRelativeToNow = value;
    }
    return entry;
  },

  /** Sets how long (in milliseconds) the entry may be inactive before removal. */
  setSlidingExpiration(entry: ICacheEntry, offsetMs: number): ICacheEntry {
    entry.slidingExpiration = offsetMs;
    return entry;
  },

  /** Registers a callback fired after the entry is evicted. */
  registerPostEvictionCallback(entry: ICacheEntry, callback: PostEvictionDelegate, state?: unknown): ICacheEntry {
    const registration = new PostEvictionCallbackRegistration();
    registration.evictionCallback = callback;
    registration.state = state;
    entry.postEvictionCallbacks.push(registration);
    return entry;
  },

  /** Sets the entry's value. */
  setValue(entry: ICacheEntry, value: unknown): ICacheEntry {
    entry.value = value;
    return entry;
  },

  /** Sets the entry's size. Throws if `size` is negative. */
  setSize(entry: ICacheEntry, size: number): ICacheEntry {
    if (size < 0) {
      throw new RangeError(`size must be non-negative, was ${size}.`);
    }
    entry.size = size;
    return entry;
  },

  /** Applies every value of `options` to `entry`. Throws if `options` carries a post-eviction registration with no callback. */
  setOptions(entry: ICacheEntry, options: MemoryCacheEntryOptions): ICacheEntry {
    entry.absoluteExpiration = options.absoluteExpiration;
    entry.absoluteExpirationRelativeToNow = options.absoluteExpirationRelativeToNow;
    entry.slidingExpiration = options.slidingExpiration;
    entry.priority = options.priority;
    entry.size = options.size;

    const expirationTokens = options.expirationTokensDirect;
    if (expirationTokens !== undefined) {
      for (const token of expirationTokens) {
        CacheEntryExtensions.addExpirationToken(entry, token);
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
} satisfies AugmentationSet<ICacheEntry>;

declare module './ICacheEntry' {
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

registerAugmentations(tokenfor<ICacheEntry>(), CacheEntryExtensions);
