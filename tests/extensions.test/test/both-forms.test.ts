// Behaviour-equivalence tests across BOTH directions of the dual-export
// convention (docs decisions.md §28): the standalone object-literal member and
// the prototype/instance method must produce identical results.
//
//   - foreign-class direction (a class owned by another package): config's
//     addInMemoryCollection on ConfigurationBuilder.
//   - reverse direction (a package-owned interface, method installed on the
//     downstream concrete class): caching's get/set/setPriority on
//     MemoryCache/ICacheEntry, and diagnostics' addMetricsListener on the
//     .core-interface / downstream-concrete MetricsBuilder.

import { CacheEntryExtensions, CacheExtensions, CacheItemPriority } from "@rhombus-std/caching.core";
import { MemoryCache, MemoryCacheOptions } from "@rhombus-std/caching.memory";
import { ConfigurationBuilder, MemoryConfigurationBuilderExtensions } from "@rhombus-std/config";
import type { ServiceManifestBase } from "@rhombus-std/di.core";
import { MetricsBuilder } from "@rhombus-std/diagnostics";
import { METRICS_LISTENER_TOKEN, MetricsBuilderExtensions } from "@rhombus-std/diagnostics.core";
import type { IMetricsListener } from "@rhombus-std/diagnostics.core";
import { describe, expect, test } from "bun:test";

describe("foreign-class direction — addInMemoryCollection", () => {
  test("method form and standalone form yield the same configuration", () => {
    const viaMethod = new ConfigurationBuilder().addInMemoryCollection({ Key: "value" }).build();
    const viaMember = MemoryConfigurationBuilderExtensions
      .addInMemoryCollection(new ConfigurationBuilder(), { Key: "value" })
      .build();

    expect(viaMethod.get("Key")).toBe("value");
    expect(viaMethod.get("Key")).toBe(viaMember.get("Key"));
  });
});

describe("reverse direction — MemoryCache / ICacheEntry", () => {
  test("get/set method form equals the object-literal member form", () => {
    const cache = new MemoryCache(new MemoryCacheOptions());

    cache.set("a", 1); // method form
    CacheExtensions.set(cache, "b", 2); // standalone member form

    expect(cache.get<number>("a")).toBe(1);
    expect(CacheExtensions.get<number>(cache, "b")).toBe(2);
    // cross-check: the two read forms agree on the same key.
    expect(cache.get("b")).toBe(CacheExtensions.get(cache, "b"));
  });

  test("entry setPriority method form equals the object-literal member form", () => {
    const cache = new MemoryCache(new MemoryCacheOptions());

    const viaMethod = cache.createEntry("x");
    viaMethod.setPriority(CacheItemPriority.High);

    const viaMember = cache.createEntry("y");
    CacheEntryExtensions.setPriority(viaMember, CacheItemPriority.High);

    expect(viaMethod.priority).toBe(CacheItemPriority.High);
    expect(viaMethod.priority).toBe(viaMember.priority);
  });
});

describe("reverse direction — MetricsBuilder (.core interface, downstream concrete)", () => {
  test("addMetricsListener method form equals the object-literal member form", () => {
    const recorded: [unknown, unknown][] = [];
    const services = {
      add: () => ({ as: () => {} }),
      addFactory: () => ({ as: () => {} }),
      addValue: (token: unknown, value: unknown) => {
        recorded.push([token, value]);
      },
      build: () => undefined,
    } as unknown as ServiceManifestBase;

    const builder = new MetricsBuilder(services);
    const listener = { name: "listener" } as IMetricsListener;

    builder.addMetricsListener(listener); // method form
    MetricsBuilderExtensions.addMetricsListener(builder, listener); // standalone member form

    expect(recorded).toEqual([
      [METRICS_LISTENER_TOKEN, listener],
      [METRICS_LISTENER_TOKEN, listener],
    ]);
  });
});
