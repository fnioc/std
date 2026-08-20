/** Holds a snapshot of statistics for a memory cache. */
export class MemoryCacheStatistics {
  /** The number of entries currently in the memory cache. */
  public readonly currentEntryCount: number;

  /**
   * An estimated sum of all the entry sizes currently in the memory cache, or
   * `undefined` if size isn't being tracked (the common `MemoryCache`
   * implementation tracks size whenever a `sizeLimit` is set on the cache).
   */
  public readonly currentEstimatedSize: number | undefined;

  /** The total number of cache misses. */
  public readonly totalMisses: number;

  /** The total number of cache hits. */
  public readonly totalHits: number;

  /**
   * The total number of cache evictions. Includes entries removed by cache
   * eviction policies (expiration or capacity limits); does NOT include
   * entries removed explicitly by user code (`remove`/`clear`) or entries
   * replaced by new values.
   */
  public readonly totalEvictions: number;

  public constructor(
    init: { currentEntryCount?: number; currentEstimatedSize?: number; totalMisses?: number; totalHits?: number; totalEvictions?: number; } = {},
  ) {
    this.currentEntryCount = init.currentEntryCount ?? 0;
    this.currentEstimatedSize = init.currentEstimatedSize;
    this.totalMisses = init.totalMisses ?? 0;
    this.totalHits = init.totalHits ?? 0;
    this.totalEvictions = init.totalEvictions ?? 0;
  }
}
