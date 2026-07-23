// MemoryCache -- a real IMemoryCache implementation, ported from
// ME.Caching.Memory's MemoryCache.
//
// JS is single-threaded, so the reference runtime's concurrency machinery
// (CoherentState, Interlocked size CAS loops, the string/non-string
// ConcurrentDictionary split, the per-thread Stats/StatsHandler statistics
// sharding, background Task-scheduled scans/compaction) collapses to a plain
// `Map`, straight-line size arithmetic, and plain counters. Behavior is
// preserved:
//   - Absolute / sliding / token expiration, enforced LAZILY on access and by
//     an inline periodic scan gated on `expirationScanFrequency`.
//   - A size limit with priority- then LRU-ordered compaction, run
//     synchronously on the insert that would overflow (the reference defers it
//     to a background thread; the effect is the same).
//   - Eviction callbacks fired on remove / replace / expire / capacity.
//   - Statistics (`MemoryCacheOptions.trackStatistics`): hit/miss/eviction
//     counters and the entry-count/estimated-size snapshot via
//     `getCurrentStatistics`.
//   - Linked cache-entry tracking (`MemoryCacheOptions.trackLinkedCacheEntries`):
//     see cache-entry.ts's module doc for the ambient-scope divergence from
//     the reference (a module-scoped synchronous chain instead of an
//     async-context slot).
//
// NOT ported: the meter/observable-counter metrics (`IMeterFactory` ctor
// parameter, the counter instruments) -- they need a meter/instrument analog
// the diagnostics family deliberately does not provide (no listener runtime).

import { CacheItemPriority, type CacheTryGetResult, EvictionReason, type ICacheEntry, type IMemoryCache,
  MemoryCacheStatistics } from '@rhombus-std/caching.core';
import type { ILogger, ILoggerFactory } from '@rhombus-std/logging.core';
import type { IOptions } from '@rhombus-std/options';
import { augment } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';
import { CacheEntry, type IMemoryCacheHost } from './CacheEntry';
import type { MemoryCacheOptions } from './MemoryCacheOptions';
import { NullLogger } from './NullLogger';

// Interface-extends merge (augmentation doctrine): binding the IMemoryCache SYMBOL
// flows every in-program augmentation of the interface (caching.core's get/set/
// getOrCreate/… convenience wrappers) onto this concrete holder, so it satisfies
// `implements IMemoryCache` without restating any member. `tryGetValue` is a base
// IMemoryCache primitive the class implements directly.
export interface MemoryCache extends IMemoryCache {}

/** A local in-memory cache backed by a `Map`. */
@augment(tokenfor<IMemoryCache>())
export class MemoryCache implements IMemoryCache, IMemoryCacheHost {
  readonly #entries = new Map<unknown, CacheEntry>();
  readonly #options: MemoryCacheOptions;
  readonly #logger: ILogger;

  #disposed = false;
  /** Aggregate of entry sizes; maintained only when a size limit is set. */
  #cacheSize = 0;
  #lastExpirationScan: number;

  /** Whether statistics are accumulated (captured once at construction). */
  readonly #trackStatistics: boolean;
  #hits = 0;
  #misses = 0;
  #evictions = 0;

  /**
   * Whether linked (nested) cache entries are tracked -- captured once at
   * construction so it is consistent for the entire cache lifetime, exactly
   * as the reference does.
   */
  public readonly trackLinkedCacheEntries: boolean;

  /**
   * @param optionsAccessor The cache options (a bare `new MemoryCacheOptions()`
   * works -- it is its own `Options` accessor).
   * @param loggerFactory Optional; a {@link NullLogger} is used when omitted.
   */
  public constructor(optionsAccessor: IOptions<MemoryCacheOptions>, loggerFactory?: ILoggerFactory) {
    this.#options = optionsAccessor.value;
    this.#logger = loggerFactory ? loggerFactory.createLogger('MemoryCache') : NullLogger;
    this.#lastExpirationScan = this.#now();
    this.#trackStatistics = this.#options.trackStatistics;
    this.trackLinkedCacheEntries = this.#options.trackLinkedCacheEntries;
  }

  /** The logger, exposed for {@link CacheEntry} eviction-callback failures. */
  public get logger(): ILogger {
    return this.#logger;
  }

  /** The number of entries currently held (diagnostic). */
  public get count(): number {
    return this.#entries.size;
  }

  /** The keys of all the entries currently held (a fresh iterator per access). */
  public get keys(): IterableIterator<unknown> {
    return this.#entries.keys();
  }

  #now(): number {
    return this.#options.clock ? this.#options.clock.utcNow.getTime() : Date.now();
  }

  get #hasSizeLimit(): boolean {
    return this.#options.sizeLimit !== undefined;
  }

  #checkDisposed(): void {
    if (this.#disposed) {
      throw new Error('MemoryCache has been disposed.');
    }
  }

  // -- IMemoryCache ---------------------------------------------------------

  public createEntry(key: unknown): ICacheEntry {
    this.#checkDisposed();
    return new CacheEntry(key, this);
  }

  public tryGetValue(key: unknown): CacheTryGetResult {
    this.#checkDisposed();
    const utcNow = this.#now();
    const entry = this.#entries.get(key);
    if (entry !== undefined) {
      // A Replaced entry may still be readable until its replacement commits
      // (mirrors the reference's stale-Replaced read allowance).
      if (!entry.checkExpired(utcNow) || entry.evictionReason === EvictionReason.Replaced) {
        entry.lastAccessed = utcNow;
        const value = entry.value;
        if (this.trackLinkedCacheEntries) {
          // When this entry is retrieved in the scope of creating another
          // entry, that entry needs a copy of these expiration options.
          entry.propagateOptionsToCurrent();
        }
        this.#scanForExpiredItemsIfNeeded(utcNow);
        if (this.#trackStatistics) {
          this.#hits++;
        }
        return [true, value];
      }
      if (this.#removeEntryCore(entry) && this.#trackStatistics) {
        this.#evictions++;
      }
    }
    this.#scanForExpiredItemsIfNeeded(utcNow);
    if (this.#trackStatistics) {
      this.#misses++;
    }
    return [false];
  }

  public remove(key: unknown): void {
    this.#checkDisposed();
    const entry = this.#entries.get(key);
    if (entry !== undefined) {
      this.#entries.delete(key);
      if (this.#hasSizeLimit) {
        this.#cacheSize -= entry.sizeValue;
      }
      entry.setExpired(EvictionReason.Removed);
      entry.invokeEvictionCallbacks();
    }
    this.#scanForExpiredItemsIfNeeded(this.#now());
  }

  /** Removes every entry, firing each entry's eviction callbacks. */
  public clear(): void {
    this.#checkDisposed();
    const entries = [...this.#entries.values()];
    this.#entries.clear();
    this.#cacheSize = 0;
    for (const entry of entries) {
      entry.setExpired(EvictionReason.Removed);
      entry.invokeEvictionCallbacks();
    }
  }

  /**
   * Gets a snapshot of the current statistics, or `undefined` when
   * {@link MemoryCacheOptions.trackStatistics} is off. User-initiated removals
   * (`remove`/`clear`) and replacements do not count as evictions.
   */
  public getCurrentStatistics(): MemoryCacheStatistics | undefined {
    if (!this.#trackStatistics) {
      return undefined;
    }
    return new MemoryCacheStatistics({
      totalMisses: this.#misses,
      totalHits: this.#hits,
      currentEntryCount: this.count,
      currentEstimatedSize: this.#hasSizeLimit ? this.#cacheSize : undefined,
      totalEvictions: this.#evictions,
    });
  }

  public [Symbol.dispose](): void {
    this.#disposed = true;
  }

  // -- IMemoryCacheHost (commit path) ---------------------------------------

  /** Commits `entry` (called from {@link CacheEntry} disposal). */
  public setEntry(entry: CacheEntry): void {
    if (this.#disposed) {
      // No-op rather than throw: this runs during entry disposal.
      return;
    }

    if (this.#hasSizeLimit && entry.sizeValue < 0) {
      throw new Error(
        "An entry without a Size was added to a cache that has a size limit. Set the entry's size before committing it.",
      );
    }

    const utcNow = this.#now();

    // Fold absoluteExpirationRelativeToNow into an absolute deadline, keeping
    // the smaller of any existing absolute expiration.
    const relative = entry.absoluteRelativeRaw;
    if (relative > 0) {
      const candidate = utcNow + relative;
      const current = entry.absoluteExpirationMs;
      if (current < 0 || candidate < current) {
        entry.absoluteExpirationMs = candidate;
      }
    }

    entry.lastAccessed = utcNow;

    const key = entry.key;
    const prior = this.#entries.get(key);
    if (prior !== undefined) {
      prior.setExpired(EvictionReason.Replaced);
    }

    if (entry.checkExpired(utcNow)) {
      // Already expired at insert time: never stored.
      entry.invokeEvictionCallbacks();
      if (prior !== undefined) {
        this.#removeEntryCore(prior);
      }
    } else {
      const priorSize = prior !== undefined ? prior.sizeValue : 0;
      if (this.#exceedsCapacity(entry.sizeValue, priorSize)) {
        entry.setExpired(EvictionReason.Capacity);
        entry.invokeEvictionCallbacks();
        if (prior !== undefined) {
          this.#removeEntryCore(prior);
        }
        this.#overcapacityCompaction();
      } else {
        this.#entries.set(key, entry);
        if (this.#hasSizeLimit) {
          this.#cacheSize += entry.sizeValue - priorSize;
        }
        entry.attachTokens();
        if (prior !== undefined) {
          prior.invokeEvictionCallbacks();
        }
      }
    }

    this.#scanForExpiredItemsIfNeeded(utcNow);
  }

  /** Notifies the cache that a token-driven expiry evicted `entry`. */
  public entryExpired(entry: CacheEntry): void {
    if (this.#removeEntryCore(entry) && this.#trackStatistics) {
      this.#evictions++;
    }
    this.#scanForExpiredItemsIfNeeded(this.#now());
  }

  // -- size / compaction ----------------------------------------------------

  #exceedsCapacity(entrySize: number, priorSize: number): boolean {
    const sizeLimit = this.#options.sizeLimit;
    if (sizeLimit === undefined) {
      return false;
    }
    return this.#cacheSize + entrySize - priorSize > sizeLimit;
  }

  /**
   * Removes `entry` from the store IF it is still the mapped entry for its key
   * (identity check guards against removing a replacement), firing its eviction
   * callbacks. Returns whether it was removed.
   */
  #removeEntryCore(entry: CacheEntry): boolean {
    if (this.#entries.get(entry.key) === entry) {
      this.#entries.delete(entry.key);
      if (this.#hasSizeLimit) {
        this.#cacheSize -= entry.sizeValue;
      }
      entry.invokeEvictionCallbacks();
      return true;
    }
    return false;
  }

  /**
   * Removes at least `percentage` (0..1) of the entries by count, expired first
   * then by priority bucket, least-recently-used first within a bucket.
   */
  public compact(percentage: number): void {
    const removalTarget = Math.floor(this.#entries.size * percentage);
    this.#compact(removalTarget, () => 1);
  }

  #overcapacityCompaction(): void {
    const sizeLimit = this.#options.sizeLimit;
    if (sizeLimit === undefined) {
      return;
    }
    const lowWatermark = sizeLimit - sizeLimit * this.#options.compactionPercentage;
    if (this.#cacheSize > lowWatermark) {
      this.#compact(this.#cacheSize - lowWatermark, (entry) => entry.sizeValue);
    }
  }

  #compact(removalTarget: number, computeSize: Func<[CacheEntry], number>): void {
    const toRemove: CacheEntry[] = [];
    const lowPriority: CacheEntry[] = [];
    const normalPriority: CacheEntry[] = [];
    const highPriority: CacheEntry[] = [];
    let removed = 0;
    const utcNow = this.#now();

    for (const entry of this.#entries.values()) {
      if (entry.checkExpired(utcNow)) {
        toRemove.push(entry);
        removed += computeSize(entry);
      } else {
        switch (entry.priority) {
          case CacheItemPriority.Low: {
            lowPriority.push(entry);
            break;
          }
          case CacheItemPriority.Normal: {
            normalPriority.push(entry);
            break;
          }
          case CacheItemPriority.High: {
            highPriority.push(entry);
            break;
          }
          case CacheItemPriority.NeverRemove: {
            break;
          }
          default: {
            assertNever(entry.priority);
          }
        }
      }
    }

    const expireBucket = (bucket: CacheEntry[]): void => {
      if (removed >= removalTarget) {
        return;
      }
      bucket.sort((a, b) => a.lastAccessed - b.lastAccessed);
      for (const entry of bucket) {
        entry.setExpired(EvictionReason.Capacity);
        toRemove.push(entry);
        removed += computeSize(entry);
        if (removed >= removalTarget) {
          break;
        }
      }
    };

    expireBucket(lowPriority);
    expireBucket(normalPriority);
    expireBucket(highPriority);

    let actuallyRemoved = 0;
    for (const entry of toRemove) {
      if (this.#removeEntryCore(entry)) {
        actuallyRemoved++;
      }
    }
    if (actuallyRemoved > 0 && this.#trackStatistics) {
      this.#evictions += actuallyRemoved;
    }
  }

  // -- periodic expiration scan ---------------------------------------------

  #scanForExpiredItemsIfNeeded(utcNow: number): void {
    if (this.#options.expirationScanFrequency < utcNow - this.#lastExpirationScan) {
      this.#lastExpirationScan = utcNow;
      // The reference runtime hops this onto a background Task; a
      // single-threaded runtime just walks the map inline.
      for (const entry of this.#entries.values()) {
        if (entry.checkExpired(utcNow)) {
          if (this.#removeEntryCore(entry) && this.#trackStatistics) {
            this.#evictions++;
          }
        }
      }
    }
  }
}
