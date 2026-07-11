// The DistributedCacheEntryOptions convenience wrappers, ported from
// ME.Caching.Abstractions' static `DistributedCacheEntryExtensions` class --
// authored as the named `DistributedCacheEntryExtensions` augmentation object
// literal (docs §28/§38), one member per reference static method,
// receiver-first. Each returns the options bag for chaining.
//
// `SetAbsoluteExpiration`'s two overloads (TimeSpan relative / DateTimeOffset
// absolute) collapse into one `setAbsoluteExpiration` discriminated by
// `number` (ms relative) vs `Date` (absolute) -- the same union-tuple-rest
// technique as caching.core's CacheEntryExtensions (docs §42).
//
// The receiver is CLOSED (docs §38): the concrete DistributedCacheEntryOptions
// class lives in THIS package, so the class-side declaration merge and the
// direct `applyAugmentations` install both live here -- no token, no registry
// (the diagnostics.core MetricsOptions/TracingOptions precedent).

import { applyAugmentations, type AugmentationSet } from "@rhombus-std/primitives";
import { DistributedCacheEntryOptions } from "./DistributedCacheEntryOptions";

/**
 * The `DistributedCacheEntryExtensions` augmentation set for
 * {@link DistributedCacheEntryOptions} (docs §28/§38).
 */
export const DistributedCacheEntryExtensions = {
  /** Sets an absolute expiration -- `relativeToNowMs` milliseconds from now, or an absolute `Date`. */
  setAbsoluteExpiration(
    options: DistributedCacheEntryOptions,
    ...rest:
      | [relativeToNowMs: number]
      | [absolute: Date]
  ): DistributedCacheEntryOptions {
    const [value] = rest;
    if (value instanceof Date) {
      options.absoluteExpiration = value;
    } else {
      options.absoluteExpirationRelativeToNow = value;
    }
    return options;
  },

  /** Sets how long (in milliseconds) the cache entry may be inactive before removal. */
  setSlidingExpiration(
    options: DistributedCacheEntryOptions,
    offsetMs: number,
  ): DistributedCacheEntryOptions {
    options.slidingExpiration = offsetMs;
    return options;
  },
} satisfies AugmentationSet<DistributedCacheEntryOptions>;

// The method-form surface merged onto the concrete class (docs §28/§38).
declare module "./DistributedCacheEntryOptions" {
  interface DistributedCacheEntryOptions {
    setAbsoluteExpiration(relativeToNowMs: number): this;
    setAbsoluteExpiration(absolute: Date): this;
    setSlidingExpiration(offsetMs: number): this;
  }
}

applyAugmentations(DistributedCacheEntryOptions, DistributedCacheEntryExtensions);
