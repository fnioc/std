// The MemoryCacheEntryOptions fluent wrappers, ported from ME.Caching.Abstractions'
// static `MemoryCacheEntryExtensions` class -- authored as the named
// `MemoryCacheEntryExtensions` augmentation object literal (docs §28), one member
// per reference static method, receiver-first. Each returns the options bag for
// chaining, so a caller can build one reusable bag fluently and apply it to many
// entries via `CacheEntryExtensions.setOptions`.
//
// Reverse-direction dual-export: the receiver is a value object whose concrete
// class lives in THIS package, so this is a CLOSED set (docs §38) -- the
// declaration merge onto the class AND the direct `applyAugmentations` install
// both live here, no registry involved. `SetAbsoluteExpiration`'s two overloads
// (TimeSpan relative / DateTimeOffset absolute) collapse into one
// `setAbsoluteExpiration` discriminated by `number` (ms relative) vs `Date`
// (absolute), exactly as `CacheEntryExtensions` collapses the same pair.

import { applyAugmentations, type AugmentationSet, type IChangeToken } from '@rhombus-std/primitives';
import type { CacheItemPriority } from './CacheItemPriority';
import { MemoryCacheEntryOptions } from './MemoryCacheEntryOptions';
import { PostEvictionCallbackRegistration } from './PostEvictionCallbackRegistration';
import type { PostEvictionDelegate } from './PostEvictionDelegate';

/** The `MemoryCacheEntryExtensions` augmentation set for {@link MemoryCacheEntryOptions} (docs §28). */
export const MemoryCacheEntryExtensions = {
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

  /** Sets an absolute expiration -- `relativeToNowMs` milliseconds from now, or an absolute `Date`. */
  setAbsoluteExpiration(
    options: MemoryCacheEntryOptions,
    ...rest:
      | [relativeToNowMs: number]
      | [absolute: Date]
  ): MemoryCacheEntryOptions {
    const [value] = rest;
    if (value instanceof Date) {
      options.absoluteExpiration = value;
    } else {
      options.absoluteExpirationRelativeToNow = value;
    }
    return options;
  },

  /** Sets how long (in milliseconds) the entry may be inactive before removal. */
  setSlidingExpiration(options: MemoryCacheEntryOptions, offsetMs: number): MemoryCacheEntryOptions {
    options.slidingExpiration = offsetMs;
    return options;
  },

  /** Registers a callback fired after the entry the bag is applied to is evicted. */
  registerPostEvictionCallback(
    options: MemoryCacheEntryOptions,
    callback: PostEvictionDelegate,
    state?: unknown,
  ): MemoryCacheEntryOptions {
    const registration = new PostEvictionCallbackRegistration();
    registration.evictionCallback = callback;
    registration.state = state;
    options.postEvictionCallbacks.push(registration);
    return options;
  },
} satisfies AugmentationSet<MemoryCacheEntryOptions>;

// The method-form surface merged onto the MemoryCacheEntryOptions class (docs §28).
declare module './MemoryCacheEntryOptions' {
  interface MemoryCacheEntryOptions {
    setPriority(priority: CacheItemPriority): this;
    setSize(size: number): this;
    addExpirationToken(expirationToken: IChangeToken): this;
    setAbsoluteExpiration(relativeToNowMs: number): this;
    setAbsoluteExpiration(absolute: Date): this;
    setSlidingExpiration(offsetMs: number): this;
    registerPostEvictionCallback(callback: PostEvictionDelegate, state?: unknown): this;
  }
}

// Direct CLOSED-set install (docs §38) -- the concrete class lives in-package.
applyAugmentations(MemoryCacheEntryOptions, MemoryCacheEntryExtensions);
