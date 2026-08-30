// getMemoryCacheManifest: the registration a consumer merges into their own
// manifest to add IMemoryCache, the options-assembly pipeline (the reference
// AddOptions + Configure(setupAction) composition: `setup` runs LAZILY when
// the options resolve), and the ILoggerFactory injection.

import { getMemoryCacheManifest, MEMORY_CACHE_OPTIONS_ACCESSOR_TYPE, MEMORY_CACHE_TYPE, MemoryCache, MemoryCacheOptions } from '@rhombus-std/caching.memory';
import { di, noop } from '@rhombus-std/di';
import { Manifest } from '@rhombus-std/di.core';
import { LOGGER_FACTORY_TYPE, NullLogger } from '@rhombus-std/logging';
import type { ILogger, ILoggerFactory, ILoggerProvider } from '@rhombus-std/logging.core';
import { describe, expect, test } from 'bun:test';

/** An ILoggerFactory stub recording the categories it was asked for. */
class RecordingLoggerFactory implements ILoggerFactory {
  public readonly categories: string[] = [];
  public createLogger(categoryName: string): ILogger {
    this.categories.push(categoryName);
    return NullLogger.instance;
  }
  public addProvider(_provider: ILoggerProvider): void {}
  public [Symbol.dispose](): void {}
}

describe('getMemoryCacheManifest', () => {
  // Needs the standard lifetime model's singleton caching, not yet wired for this suite.
  test.skip('registers a resolvable IMemoryCache singleton', () => {});

  test('setup joins the options pipeline lazily and configures the cache', () => {
    let ran = 0;

    // The annotation pins what the function gives back: the manifest it
    // produced, which the resolve below reads an explicit type argument off.
    const returned: Manifest<unknown> = getMemoryCacheManifest((options) => {
      ran++;
      expect(options).toBeInstanceOf(MemoryCacheOptions);
      options.trackStatistics = true;
    });

    const scope = di.usingLifetimeModel(noop()).usingManifest(returned).build();
    // Lazy: the configure step has not run at registration/build time.
    expect(ran).toBe(0);

    const cache: MemoryCache = scope.resolve(MEMORY_CACHE_TYPE);
    expect(ran).toBe(1);
    // The configured options reached the cache: statistics are tracked.
    cache.get('absent');
    expect(cache.getCurrentStatistics()?.totalMisses).toBe(1);
  });

  test('the assembled IOptions<MemoryCacheOptions> is itself resolvable at its token', () => {
    const services = getMemoryCacheManifest((options) => {
      options.name = 'configured';
    });

    const scope = di.usingLifetimeModel(noop()).usingManifest(services).build();
    const options: { value: MemoryCacheOptions; } = scope.resolve(MEMORY_CACHE_OPTIONS_ACCESSOR_TYPE);
    expect(options.value).toBeInstanceOf(MemoryCacheOptions);
    expect(options.value.name).toBe('configured');
  });

  test('injects the registered ILoggerFactory into the cache', () => {
    const factory = new RecordingLoggerFactory();
    let services: Manifest<unknown> = Manifest.empty<unknown>().addValue(LOGGER_FACTORY_TYPE, factory);
    services = services.add(getMemoryCacheManifest());

    di.usingLifetimeModel(noop()).usingManifest(services).build().resolve(MEMORY_CACHE_TYPE);

    expect(factory.categories).toEqual(['MemoryCache']);
  });

  test('resolves without a registered ILoggerFactory (null-logger fallback)', () => {
    const services = getMemoryCacheManifest();

    const cache: MemoryCache = di.usingLifetimeModel(noop()).usingManifest(services).build()
      .resolve(MEMORY_CACHE_TYPE);
    expect(cache).toBeInstanceOf(MemoryCache);
  });

  test('keeps an earlier IMemoryCache registration (the reference TryAdd semantics)', () => {
    const sentinel = { marker: 'pre-registered' };
    let services: Manifest<unknown> = Manifest.empty<unknown>().addValue(MEMORY_CACHE_TYPE, sentinel);

    // Spreading into tryAdd's rest-parameter overload runs the existing-registration
    // check against the CALLER's own manifest -- unlike addMany, which appends
    // unconditionally -- so the sentinel already held for MEMORY_CACHE_TYPE survives.
    services = services.tryAdd(...getMemoryCacheManifest());

    const resolved = di.usingLifetimeModel(noop()).usingManifest(services).build().resolve(MEMORY_CACHE_TYPE);
    expect(resolved).toBe(sentinel);
  });
});
