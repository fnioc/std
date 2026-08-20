// Convenience methods on DistributedCacheEntryOptions -- set absolute/sliding
// expiration -- dot-callable on any options bag. Each returns it for chaining.

import { applyAugmentations } from '@rhombus-std/primitives';
import type { Flatten } from '@rhombus-toolkit/type-helpers';
import { DistributedCacheEntryOptions } from './DistributedCacheEntryOptions';

export namespace DistributedCacheEntryOptionsSugarAugmentations {
  /** Sets an absolute expiration -- a number of milliseconds from now, or an absolute `Date`. */
  export function setAbsoluteExpiration(this: DistributedCacheEntryOptions, expiration: number | Date): DistributedCacheEntryOptions {
    if (expiration instanceof Date) {
      this.absoluteExpiration = expiration;
    } else {
      this.absoluteExpirationRelativeToNow = expiration;
    }
    return this;
  }

  /** Sets how long (in milliseconds) the cache entry may be inactive before removal. */
  export function setSlidingExpiration(this: DistributedCacheEntryOptions, offsetMs: number): DistributedCacheEntryOptions {
    this.slidingExpiration = offsetMs;
    return this;
  }
}

declare module '@rhombus-std/caching.core' {
  interface DistributedCacheEntryOptions extends Flatten<typeof DistributedCacheEntryOptionsSugarAugmentations> {}
}

applyAugmentations(DistributedCacheEntryOptions, DistributedCacheEntryOptionsSugarAugmentations);
