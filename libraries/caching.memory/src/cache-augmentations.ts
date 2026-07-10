// Class-side type merges for the registry-installed cache convenience wrappers
// (docs §28/§38). The IMemoryCache/ICacheEntry receiver interfaces AND their
// method-form merges + registration are owned inside caching.core
// (CacheExtensions/CacheEntryExtensions self-register against the `IMemoryCache`
// / `ICacheEntry` tokens). Here we only add the class-side merges so the concrete
// MemoryCache/CacheEntry classes -- each decorated `@augment(nameof<…>())` beside
// their definition -- still SATISFY the interfaces once the runtime installs the
// members. The signatures mirror the free functions minus their leading receiver
// parameter.
//
// `tryGetValue` is deliberately NOT installed on MemoryCache: IMemoryCache
// already declares a `tryGetValue` member (the primitive the extension wraps), so
// a method-form merge would both clash with that declaration and, at runtime,
// overwrite the real implementation. The exclusion lives at caching.core's
// registration; here MemoryCache simply keeps its own `tryGetValue`.

import type {
  CacheItemPriority,
  ICacheEntry,
  MemoryCacheEntryOptions,
  PostEvictionDelegate,
} from "@rhombus-std/caching.core";
import type { IChangeToken } from "@rhombus-std/primitives";

declare module "./MemoryCache" {
  interface MemoryCache {
    get<T = unknown>(key: unknown): T | undefined;
    set<T>(key: unknown, value: T): T;
    set<T>(key: unknown, value: T, absoluteExpiration: Date): T;
    set<T>(key: unknown, value: T, relativeToNowMs: number): T;
    set<T>(key: unknown, value: T, expirationToken: IChangeToken): T;
    getOrCreate<T>(key: unknown, factory: (entry: ICacheEntry) => T): T | undefined;
    getOrCreateAsync<T>(key: unknown, factory: (entry: ICacheEntry) => Promise<T>): Promise<T | undefined>;
    setWithOptions<T>(key: unknown, value: T, options?: MemoryCacheEntryOptions): T;
    getOrCreateWithOptions<T>(
      key: unknown,
      factory: (entry: ICacheEntry) => T,
      createOptions?: MemoryCacheEntryOptions,
    ): T | undefined;
    getOrCreateAsyncWithOptions<T>(
      key: unknown,
      factory: (entry: ICacheEntry) => Promise<T>,
      createOptions?: MemoryCacheEntryOptions,
    ): Promise<T | undefined>;
  }
}

declare module "./cache-entry" {
  interface CacheEntry {
    setPriority(priority: CacheItemPriority): this;
    addExpirationToken(expirationToken: IChangeToken): this;
    setAbsoluteExpiration(relativeToNowMs: number): this;
    setAbsoluteExpiration(absolute: Date): this;
    setSlidingExpiration(offsetMs: number): this;
    registerPostEvictionCallback(callback: PostEvictionDelegate, state?: unknown): this;
    setValue(value: unknown): this;
    setSize(size: number): this;
    setOptions(options: MemoryCacheEntryOptions): this;
  }
}
