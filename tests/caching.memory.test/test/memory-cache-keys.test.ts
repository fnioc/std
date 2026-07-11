// MemoryCache.keys (the reference MemoryCache.Keys port): enumerates the keys
// of the entries currently held, freshly per access.

import { MemoryCache, MemoryCacheOptions } from "@rhombus-std/caching.memory";
import { describe, expect, test } from "bun:test";

describe("MemoryCache.keys", () => {
  test("enumerates all current keys, including non-string keys", () => {
    const cache = new MemoryCache(new MemoryCacheOptions());
    const objectKey = { id: 1 };
    cache.set("a", 1);
    cache.set(objectKey, 2);
    cache.set("b", 3);

    expect([...cache.keys]).toEqual(["a", objectKey, "b"]);
  });

  test("reflects removals, and each access yields a fresh enumeration", () => {
    const cache = new MemoryCache(new MemoryCacheOptions());
    cache.set("a", 1);
    cache.set("b", 2);

    expect([...cache.keys]).toEqual(["a", "b"]);

    cache.remove("a");
    expect([...cache.keys]).toEqual(["b"]);

    cache.clear();
    expect([...cache.keys]).toEqual([]);
    expect(cache.count).toBe(0);
  });
});
