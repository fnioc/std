// MemoryCacheOptions -- ported from ME.Caching.Memory's MemoryCacheOptions.
//
// The reference implements `IOptions<MemoryCacheOptions>` (Value => this); this
// repo's collapsed accessor is @rhombus-std/options' `Options<T>`, so this
// class implements that instead -- `value` returns itself, so a MemoryCache
// can be constructed straight from a `new MemoryCacheOptions()`.
//
// Durations map to milliseconds (`number`): the reference
// `ExpirationScanFrequency` default `TimeSpan.FromMinutes(1)` becomes 60_000.
// The obsolete `CompactOnMemoryPressure` and the metrics/statistics surface
// (`TrackStatistics`, `Name`) are dropped -- no consumer this pass; noted in
// the README.

import type { Options } from "@rhombus-std/options";
import type { ISystemClock } from "./ISystemClock";

/** Options controlling a {@link MemoryCache}. */
export class MemoryCacheOptions implements Options<MemoryCacheOptions> {
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
   * Whether linked (nested) cache entries are tracked. Always `false` here:
   * the AsyncLocal-based linking of the reference runtime is not ported (see
   * the README).
   */
  public trackLinkedCacheEntries = false;

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

  /** Self-referential accessor: mirrors the reference `IOptions<T>.Value => this`. */
  public get value(): MemoryCacheOptions {
    return this;
  }
}
