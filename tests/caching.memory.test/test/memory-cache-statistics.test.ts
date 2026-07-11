// MemoryCache statistics (the reference GetCurrentStatistics/
// MemoryCacheStatistics port): hit/miss/eviction counters, entry count, and
// the size-limit-gated estimated size. Black-box through the public surface.

import { MemoryCacheEntryOptions, MemoryCacheStatistics } from "@rhombus-std/caching.core";
import { type ISystemClock, MemoryCache, MemoryCacheOptions } from "@rhombus-std/caching.memory";
import { describe, expect, test } from "bun:test";

/** A manually-advanced clock driving expiration deterministically. */
class FakeClock implements ISystemClock {
  public nowMs = 1_000_000;
  public get utcNow(): Date {
    return new Date(this.nowMs);
  }
}

function makeCache(configure?: (options: MemoryCacheOptions) => void): {
  cache: MemoryCache;
  clock: FakeClock;
} {
  const clock = new FakeClock();
  const options = new MemoryCacheOptions();
  options.clock = clock;
  options.trackStatistics = true;
  configure?.(options);
  return { cache: new MemoryCache(options), clock };
}

describe("MemoryCache.getCurrentStatistics", () => {
  test("returns undefined when statistics are not tracked", () => {
    const cache = new MemoryCache(new MemoryCacheOptions());
    cache.set("key", 1);
    cache.get("key");
    expect(cache.getCurrentStatistics()).toBeUndefined();
  });

  test("starts at zero and counts hits and misses", () => {
    const { cache } = makeCache();
    expect(cache.getCurrentStatistics()).toEqual(new MemoryCacheStatistics({}));

    cache.get("absent"); // miss
    cache.set("key", 42);
    cache.get("key"); // hit
    cache.get("key"); // hit

    const stats = cache.getCurrentStatistics();
    expect(stats).toBeInstanceOf(MemoryCacheStatistics);
    expect(stats?.totalHits).toBe(2);
    expect(stats?.totalMisses).toBe(1);
    expect(stats?.currentEntryCount).toBe(1);
    // No size limit: size is not tracked.
    expect(stats?.currentEstimatedSize).toBeUndefined();
  });

  test("estimates size when a size limit is set", () => {
    const { cache } = makeCache((options) => {
      options.sizeLimit = 100;
    });
    cache.setWithOptions("a", 1, new MemoryCacheEntryOptions().setSize(3));
    cache.setWithOptions("b", 2, new MemoryCacheEntryOptions().setSize(7));

    expect(cache.getCurrentStatistics()?.currentEstimatedSize).toBe(10);
  });

  test("counts an expired-on-read removal as both an eviction and a miss", () => {
    const { cache, clock } = makeCache();
    cache.set("key", 1, 500); // relative-to-now expiration

    clock.nowMs += 501;
    expect(cache.get("key")).toBeUndefined();

    const stats = cache.getCurrentStatistics();
    expect(stats?.totalEvictions).toBe(1);
    expect(stats?.totalMisses).toBe(1);
    expect(stats?.totalHits).toBe(0);
    expect(stats?.currentEntryCount).toBe(0);
  });

  test("counts compaction removals as evictions", () => {
    const { cache } = makeCache();
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    cache.compact(1);

    expect(cache.getCurrentStatistics()?.totalEvictions).toBe(3);
    expect(cache.getCurrentStatistics()?.currentEntryCount).toBe(0);
  });

  test("does not count user-initiated remove/clear or replacement as evictions", () => {
    const { cache } = makeCache();
    cache.set("a", 1);
    cache.set("a", 2); // replaced
    cache.set("b", 3);
    cache.remove("a");
    cache.clear();

    expect(cache.getCurrentStatistics()?.totalEvictions).toBe(0);
  });
});
