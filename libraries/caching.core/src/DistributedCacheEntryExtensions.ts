// Convenience methods on DistributedCacheEntryOptions -- set absolute/sliding
// expiration -- dot-callable on any options bag. Each returns it for chaining.

import { applyAugmentations, type AugmentationSet } from '@rhombus-std/primitives';
import { DistributedCacheEntryOptions } from './DistributedCacheEntryOptions';

/** The convenience methods added to {@link DistributedCacheEntryOptions}. */
export const DistributedCacheEntryExtensions = {
  /** Sets an absolute expiration -- `relativeToNowMs` milliseconds from now, or an absolute `Date`. */
  setAbsoluteExpiration(options: DistributedCacheEntryOptions,
    ...rest: [relativeToNowMs: number] | [absolute: Date]): DistributedCacheEntryOptions
  {
    const [value] = rest;
    if (value instanceof Date) {
      options.absoluteExpiration = value;
    } else {
      options.absoluteExpirationRelativeToNow = value;
    }
    return options;
  },

  /** Sets how long (in milliseconds) the cache entry may be inactive before removal. */
  setSlidingExpiration(options: DistributedCacheEntryOptions, offsetMs: number): DistributedCacheEntryOptions {
    options.slidingExpiration = offsetMs;
    return options;
  },
} satisfies AugmentationSet<DistributedCacheEntryOptions>;

declare module './DistributedCacheEntryOptions' {
  interface DistributedCacheEntryOptions {
    setAbsoluteExpiration(relativeToNowMs: number): this;
    setAbsoluteExpiration(absolute: Date): this;
    setSlidingExpiration(offsetMs: number): this;
  }
}

applyAugmentations(DistributedCacheEntryOptions, DistributedCacheEntryExtensions);
