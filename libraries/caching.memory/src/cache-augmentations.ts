// Reverse-direction dual-export (docs §22) for the cache convenience wrappers.
// The IMemoryCache/ICacheEntry receiver interfaces live in caching.core and their
// standalone free-function form ships there (CacheExtensions/CacheEntryExtensions)
// and here (the MemoryCacheEntryOptions-typed overloads). Per the cross-package
// rule, the only concrete receiver classes (MemoryCache/CacheEntry) live in THIS
// package, so both the declaration merge and the runtime install live here --
// importing the free functions from caching.core -- so a caching.core-only consumer
// never sees a method type with no runtime behind it.
//
// `tryGetValue` is deliberately NOT installed: IMemoryCache already declares a
// `tryGetValue` member (the primitive the extension wraps), so a method-form merge
// would both clash with that declaration and, at runtime, overwrite the real
// implementation. Its standalone free function stays the only form.

import type { CacheItemPriority, ICacheEntry, PostEvictionDelegate } from "@rhombus-std/caching.core";
import { CacheEntryExtensions, CacheExtensions } from "@rhombus-std/caching.core";
import type { IChangeToken } from "@rhombus-std/primitives";
import { applyAugmentations } from "@rhombus-std/primitives";
import { CacheEntry } from "./cache-entry";
import { MemoryCacheEntryExtensions, MemoryCacheExtensions } from "./entry-options-extensions";
import { MemoryCache } from "./memory-cache";
import type { MemoryCacheEntryOptions } from "./memory-cache-entry-options";

// Merge the method form onto the OWNING interfaces (so a consumer holding
// IMemoryCache/ICacheEntry sees them) AND onto the concrete classes (so they still
// SATISFY the interfaces once the new names are on them). The signatures mirror the
// free functions minus their leading receiver parameter.
declare module "@rhombus-std/caching.core" {
  interface IMemoryCache {
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

  interface ICacheEntry {
    setPriority(priority: CacheItemPriority): this;
    addExpirationToken(expirationToken: IChangeToken): this;
    setAbsoluteExpiration(relativeToNowMs: number): this;
    setAbsoluteExpiration(absolute: Date): this;
    setSlidingExpiration(offsetMs: number): this;
    registerPostEvictionCallback(callback: PostEvictionDelegate, state?: unknown): this;
    setValue(value: unknown): this;
    setSize(size: number): this;
    setEntryOptions(options: MemoryCacheEntryOptions): this;
  }
}

declare module "./memory-cache" {
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
    setEntryOptions(options: MemoryCacheEntryOptions): this;
  }
}

// `tryGetValue` is a member of `CacheExtensions` (its standalone surface) but is
// deliberately NOT prototype-installed: `IMemoryCache` already declares a
// `tryGetValue` member, so a method merge would both clash with that declaration
// and, at runtime, overwrite the real implementation the wrapper builds on. Omit
// it via a rest destructure (TS exempts the rest-sibling from unused checks).
const { tryGetValue, ...cacheInstanceMethods } = CacheExtensions;

applyAugmentations(MemoryCache, cacheInstanceMethods);
applyAugmentations(MemoryCache, MemoryCacheExtensions);
applyAugmentations(CacheEntry, CacheEntryExtensions);
applyAugmentations(CacheEntry, MemoryCacheEntryExtensions);
