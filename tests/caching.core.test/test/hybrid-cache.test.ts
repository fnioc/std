// The hybrid-cache abstractions, black-box through the public barrel
// (caching.core is the ttsc build pilot -- no dist/internal white-box
// surface): HybridCacheEntryFlags bit identities, HybridCacheEntryOptions
// init-bag semantics, the HybridCache batch-remove virtual defaults over a
// recording subclass, and a hand-written IHybridCacheSerializer /
// IHybridCacheSerializerFactory pair (the compile-time contract guard).

import {
  HybridCache,
  HybridCacheEntryFlags,
  HybridCacheEntryOptions,
  type IHybridCacheSerializer,
  type IHybridCacheSerializerFactory,
} from "@rhombus-std/caching.core";
import type { AbortSignal } from "@rhombus-std/primitives";
import { describe, expect, test } from "bun:test";

describe("HybridCacheEntryFlags", () => {
  test("carries the reference bit values", () => {
    expect(HybridCacheEntryFlags.None).toBe(0);
    expect(HybridCacheEntryFlags.DisableLocalCacheRead).toBe(1);
    expect(HybridCacheEntryFlags.DisableLocalCacheWrite).toBe(2);
    expect(HybridCacheEntryFlags.DisableDistributedCacheRead).toBe(4);
    expect(HybridCacheEntryFlags.DisableDistributedCacheWrite).toBe(8);
    expect(HybridCacheEntryFlags.DisableUnderlyingData).toBe(16);
    expect(HybridCacheEntryFlags.DisableCompression).toBe(32);
  });

  test("the Disable*Cache members are the read|write combinations", () => {
    expect(HybridCacheEntryFlags.DisableLocalCache).toBe(
      HybridCacheEntryFlags.DisableLocalCacheRead | HybridCacheEntryFlags.DisableLocalCacheWrite,
    );
    expect(HybridCacheEntryFlags.DisableDistributedCache).toBe(
      HybridCacheEntryFlags.DisableDistributedCacheRead
        | HybridCacheEntryFlags.DisableDistributedCacheWrite,
    );
  });
});

describe("HybridCacheEntryOptions", () => {
  test("defaults to everything unset", () => {
    const options = new HybridCacheEntryOptions();
    expect(options.expiration).toBeUndefined();
    expect(options.localCacheExpiration).toBeUndefined();
    expect(options.flags).toBeUndefined();
  });

  test("stores the init-bag values readonly", () => {
    const options = new HybridCacheEntryOptions({
      expiration: 60_000,
      localCacheExpiration: 5_000,
      flags: HybridCacheEntryFlags.DisableCompression,
    });
    expect(options.expiration).toBe(60_000);
    expect(options.localCacheExpiration).toBe(5_000);
    expect(options.flags).toBe(HybridCacheEntryFlags.DisableCompression);
  });

  test("a partial init bag leaves the rest unset", () => {
    const options = new HybridCacheEntryOptions({ expiration: 1_000 });
    expect(options.expiration).toBe(1_000);
    expect(options.localCacheExpiration).toBeUndefined();
    expect(options.flags).toBeUndefined();
  });
});

/** A minimal HybridCache: implements only the abstract members, recording calls. */
class RecordingHybridCache extends HybridCache {
  public readonly calls: Array<{ member: string; arg: string; abortSignal: AbortSignal | undefined }> = [];

  public override getOrCreate<T>(
    key: string,
    factory: (abortSignal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    this.calls.push({ member: "getOrCreate", arg: key, abortSignal: undefined });
    return factory(new AbortController().signal);
  }

  public override set<T>(key: string, _value: T): Promise<void> {
    this.calls.push({ member: "set", arg: key, abortSignal: undefined });
    return Promise.resolve();
  }

  public override remove(key: string, abortSignal?: AbortSignal): Promise<void> {
    this.calls.push({ member: "remove", arg: key, abortSignal });
    return Promise.resolve();
  }

  public override removeByTag(tag: string, abortSignal?: AbortSignal): Promise<void> {
    this.calls.push({ member: "removeByTag", arg: tag, abortSignal });
    return Promise.resolve();
  }
}

describe("HybridCache", () => {
  test("getOrCreate resolves through the factory", async () => {
    const cache = new RecordingHybridCache();
    const value = await cache.getOrCreate("k", () => Promise.resolve(42));
    expect(value).toBe(42);
    expect(cache.calls).toEqual([{ member: "getOrCreate", arg: "k", abortSignal: undefined }]);
  });

  test("removeKeys default loops remove per key, in order, passing the signal", async () => {
    const cache = new RecordingHybridCache();
    const signal = new AbortController().signal;

    await cache.removeKeys(["a", "b", "c"], signal);

    expect(cache.calls).toEqual([
      { member: "remove", arg: "a", abortSignal: signal },
      { member: "remove", arg: "b", abortSignal: signal },
      { member: "remove", arg: "c", abortSignal: signal },
    ]);
  });

  test("removeKeys over an empty iterable removes nothing", async () => {
    const cache = new RecordingHybridCache();
    await cache.removeKeys([]);
    expect(cache.calls).toEqual([]);
  });

  test("removeKeys accepts any iterable, not just arrays", async () => {
    const cache = new RecordingHybridCache();
    await cache.removeKeys(new Set(["x", "y"]));
    expect(cache.calls.map((call) => call.arg)).toEqual(["x", "y"]);
  });

  test("removeByTags default loops removeByTag per tag, in order, passing the signal", async () => {
    const cache = new RecordingHybridCache();
    const signal = new AbortController().signal;

    await cache.removeByTags(["t1", "t2"], signal);

    expect(cache.calls).toEqual([
      { member: "removeByTag", arg: "t1", abortSignal: signal },
      { member: "removeByTag", arg: "t2", abortSignal: signal },
    ]);
  });

  test("the batch defaults are independently overridable", async () => {
    class BatchingHybridCache extends RecordingHybridCache {
      public override removeKeys(keys: Iterable<string>): Promise<void> {
        this.calls.push({ member: "removeKeys", arg: [...keys].join(","), abortSignal: undefined });
        return Promise.resolve();
      }
    }
    const cache = new BatchingHybridCache();

    await cache.removeKeys(["a", "b"]);
    await cache.removeByTags(["t"]);

    expect(cache.calls).toEqual([
      { member: "removeKeys", arg: "a,b", abortSignal: undefined },
      { member: "removeByTag", arg: "t", abortSignal: undefined },
    ]);
  });
});

describe("IHybridCacheSerializer / IHybridCacheSerializerFactory", () => {
  /** A hand-written string serializer: UTF-8 in, UTF-8 out. */
  const stringSerializer: IHybridCacheSerializer<string> = {
    deserialize(source) {
      return new TextDecoder().decode(source);
    },
    serialize(value) {
      return new TextEncoder().encode(value);
    },
  };

  /** A hand-written factory: supports only the string token (literal, docs §40). */
  const factory: IHybridCacheSerializerFactory = {
    tryCreateSerializer<T>(type: string): IHybridCacheSerializer<T> | undefined {
      return type === "typescript:string"
        ? (stringSerializer as IHybridCacheSerializer<unknown> as IHybridCacheSerializer<T>)
        : undefined;
    },
  };

  test("a serializer round-trips through plain Uint8Array payloads", () => {
    const payload = stringSerializer.serialize("héllo hybrid ✓");
    expect(payload).toBeInstanceOf(Uint8Array);
    expect(stringSerializer.deserialize(payload)).toBe("héllo hybrid ✓");
  });

  test("a factory returns a serializer for a supported type token and undefined otherwise", () => {
    const created = factory.tryCreateSerializer<string>("typescript:string");
    expect(created).toBe(stringSerializer);
    expect(factory.tryCreateSerializer<number>("typescript:number")).toBeUndefined();
  });
});
