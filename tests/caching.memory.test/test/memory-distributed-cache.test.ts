// MemoryDistributedCache behavior: byte round-trips, entry-options-driven
// expiration over a fake clock, refresh's sliding-window reset, and the
// registry-installed setString/getString method form (docs §38/§40).

import { DistributedCacheEntryOptions, DistributedCacheExtensions } from "@rhombus-std/caching.core";
import { type ISystemClock, MemoryDistributedCache, MemoryDistributedCacheOptions } from "@rhombus-std/caching.memory";
import { describe, expect, test } from "bun:test";

/** A manually-advanced clock driving the inner MemoryCache's expiration. */
class FakeClock implements ISystemClock {
  public nowMs = 1_000_000;
  public get utcNow(): Date {
    return new Date(this.nowMs);
  }
}

function makeCache(): { cache: MemoryDistributedCache; clock: FakeClock } {
  const clock = new FakeClock();
  const options = new MemoryDistributedCacheOptions();
  options.clock = clock;
  return { cache: new MemoryDistributedCache(options), clock };
}

describe("MemoryDistributedCacheOptions", () => {
  test("defaults the size limit to 200 MB and is its own accessor", () => {
    const options = new MemoryDistributedCacheOptions();
    expect(options.sizeLimit).toBe(200 * 1024 * 1024);
    expect(options.value).toBe(options);
  });
});

describe("MemoryDistributedCache", () => {
  test("set/get round-trips the byte payload; a miss resolves undefined", async () => {
    const { cache } = makeCache();
    const payload = new Uint8Array([10, 20, 30]);

    await cache.set("key", payload, new DistributedCacheEntryOptions());

    expect(await cache.get("key")).toBe(payload);
    expect(await cache.get("absent")).toBeUndefined();
  });

  test("remove deletes the item", async () => {
    const { cache } = makeCache();
    await cache.set("key", new Uint8Array([1]), new DistributedCacheEntryOptions());

    await cache.remove("key");

    expect(await cache.get("key")).toBeUndefined();
  });

  test("honors a relative absolute expiration", async () => {
    const { cache, clock } = makeCache();
    const options = new DistributedCacheEntryOptions().setAbsoluteExpiration(1_000);
    await cache.set("key", new Uint8Array([1]), options);

    clock.nowMs += 999;
    expect(await cache.get("key")).toBeDefined();

    clock.nowMs += 2;
    expect(await cache.get("key")).toBeUndefined();
  });

  test("refresh resets the sliding expiration window", async () => {
    const { cache, clock } = makeCache();
    const options = new DistributedCacheEntryOptions().setSlidingExpiration(1_000);
    await cache.set("key", new Uint8Array([1]), options);

    // Refresh just inside the window keeps the entry alive past the original deadline.
    clock.nowMs += 800;
    await cache.refresh("key");
    clock.nowMs += 800; // 1600ms total, but only 800ms since the refresh
    expect(await cache.get("key")).toBeDefined();

    // Let the window lapse with no access: gone.
    clock.nowMs += 1_100;
    expect(await cache.get("key")).toBeUndefined();
  });

  test("refresh on a missing key is a no-op", async () => {
    const { cache } = makeCache();
    await cache.refresh("absent");
    expect(await cache.get("absent")).toBeUndefined();
  });

  test("setString/getString method form equals the standalone member form", async () => {
    const { cache } = makeCache();

    await cache.setString("method", "vía-method ✓");
    await DistributedCacheExtensions.setString(cache, "member", "vía-member ✓");

    expect(await cache.getString("method")).toBe("vía-method ✓");
    expect(await DistributedCacheExtensions.getString(cache, "method")).toBe("vía-method ✓");
    expect(await cache.getString("member")).toBe("vía-member ✓");
  });
});
