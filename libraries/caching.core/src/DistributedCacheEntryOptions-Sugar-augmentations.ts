// Convenience methods on DistributedCacheEntryOptions -- set absolute/sliding
// expiration -- dot-callable on any options bag. Each returns it for chaining.

import { applyAugmentations, type AugmentationSet } from '@rhombus-std/primitives';
import { DistributedCacheEntryOptions } from './DistributedCacheEntryOptions';

interface IDistributedCacheEntryOptionsSugarAugmentations {
  setAbsoluteExpiration(expiration: number | Date): this;
  setSlidingExpiration(offsetMs: number): this;
}

declare module '@rhombus-std/caching.core' {
  interface DistributedCacheEntryOptions extends IDistributedCacheEntryOptionsSugarAugmentations {}
}

export const DistributedCacheEntryOptionsSugarAugmentations = {
  /** Sets an absolute expiration -- a number of milliseconds from now, or an absolute `Date`. */
  setAbsoluteExpiration(options: DistributedCacheEntryOptions,
    expiration: number | Date): DistributedCacheEntryOptions {
    if (expiration instanceof Date) {
      options.absoluteExpiration = expiration;
    } else {
      options.absoluteExpirationRelativeToNow = expiration;
    }
    return options;
  },

  /** Sets how long (in milliseconds) the cache entry may be inactive before removal. */
  setSlidingExpiration(options: DistributedCacheEntryOptions, offsetMs: number): DistributedCacheEntryOptions {
    options.slidingExpiration = offsetMs;
    return options;
  },
} satisfies AugmentationSet<DistributedCacheEntryOptions>;

applyAugmentations(DistributedCacheEntryOptions, DistributedCacheEntryOptionsSugarAugmentations);
