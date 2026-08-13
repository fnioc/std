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
  setAbsoluteExpiration(expiration: number | Date): DistributedCacheEntryOptions {
    if (expiration instanceof Date) {
      this.absoluteExpiration = expiration;
    } else {
      this.absoluteExpirationRelativeToNow = expiration;
    }
    return this;
  },

  /** Sets how long (in milliseconds) the cache entry may be inactive before removal. */
  setSlidingExpiration(offsetMs: number): DistributedCacheEntryOptions {
    this.slidingExpiration = offsetMs;
    return this;
  },
} satisfies AugmentationSet<DistributedCacheEntryOptions>;

applyAugmentations(DistributedCacheEntryOptions, DistributedCacheEntryOptionsSugarAugmentations);
