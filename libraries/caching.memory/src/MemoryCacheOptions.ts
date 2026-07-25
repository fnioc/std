// `value` returns itself, so a MemoryCache can be constructed straight from
// `new MemoryCacheOptions()`. Durations are plain milliseconds (`number`).

import type { IOptions } from '@rhombus-std/options';
import type { ISystemClock } from './ISystemClock';

/** Options controlling a {@link MemoryCache}. */
export class MemoryCacheOptions implements IOptions<MemoryCacheOptions> {
  #sizeLimit: number | undefined = undefined;
  #compactionPercentage = 0.05;

  /** The clock used for expiration. Defaults to the system clock (`Date.now`). */
  public clock: ISystemClock | undefined = undefined;

  /**
   * The minimum time (milliseconds) between successive scans for expired
   * items. Defaults to 60_000 (one minute).
   */
  public expirationScanFrequency = 60_000;

  /**
   * Whether linked (nested) cache entries are tracked: while an entry created
   * by {@link MemoryCache.createEntry} is pending (not yet committed by its
   * dispose), entries read or committed within that window propagate their
   * expiration tokens and earlier absolute expirations to it. Defaults to
   * `false`.
   */
  public trackLinkedCacheEntries = false;

  /**
   * Whether cache statistics (hits, misses, evictions, entry count, estimated
   * size) are tracked, surfacing through
   * {@link MemoryCache.getCurrentStatistics}. Defaults to `false`.
   */
  public trackStatistics = false;

  /** The name of this cache instance. Currently informational only -- nothing reads it yet. */
  public name = 'Default';

  /**
   * The maximum total size of the cache (arbitrary units; each entry supplies
   * its own size). `undefined` means unbounded. Throws if set negative.
   */
  public get sizeLimit(): number | undefined {
    return this.#sizeLimit;
  }

  public set sizeLimit(value: number | undefined) {
    if (value !== undefined && value < 0) {
      throw new RangeError(`sizeLimit must be non-negative, was ${value}.`);
    }
    this.#sizeLimit = value;
  }

  /**
   * The fraction (0..1) of the cache removed when the size limit is exceeded.
   * Defaults to 0.05. Throws if outside [0, 1].
   */
  public get compactionPercentage(): number {
    return this.#compactionPercentage;
  }

  public set compactionPercentage(value: number) {
    if (value < 0 || value > 1) {
      throw new RangeError(`compactionPercentage must be between 0 and 1 inclusive, was ${value}.`);
    }
    this.#compactionPercentage = value;
  }

  public get value(): MemoryCacheOptions {
    return this;
  }
}
