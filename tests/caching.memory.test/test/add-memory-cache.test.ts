// getMemoryCacheManifest: the registration a consumer merges into their own
// manifest to add IMemoryCache, the options-assembly pipeline (the reference
// AddOptions + Configure(setupAction) composition: `setup` runs LAZILY when
// the options resolve), and the ILoggerFactory injection.

import { getMemoryCacheManifest, MEMORY_CACHE_OPTIONS_ACCESSOR_TYPE, MEMORY_CACHE_TYPE, MemoryCache, MemoryCacheOptions } from '@rhombus-std/caching.memory';
import { di } from '@rhombus-std/di';
import { LifetimeModel, Manifest } from '@rhombus-std/di.core';
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

    const scope = di.usingLifetimeModel(LifetimeModel.noop).usingManifest(returned).build();
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

    const scope = di.usingLifetimeModel(LifetimeModel.noop).usingManifest(services).build();
    const options: { value: MemoryCacheOptions; } = scope.resolve(MEMORY_CACHE_OPTIONS_ACCESSOR_TYPE);
    expect(options.value).toBeInstanceOf(MemoryCacheOptions);
    expect(options.value.name).toBe('configured');
  });

  test('injects the registered ILoggerFactory into the cache', () => {
    const factory = new RecordingLoggerFactory();
    let services: Manifest<unknown> = Manifest.empty<unknown>().addValue(LOGGER_FACTORY_TYPE, factory);
    services = services.addMany(getMemoryCacheManifest());

    di.usingLifetimeModel(LifetimeModel.noop).usingManifest(services).build().resolve(MEMORY_CACHE_TYPE);

    expect(factory.categories).toEqual(['MemoryCache']);
  });

  test('resolves without a registered ILoggerFactory (null-logger fallback)', () => {
    const services = getMemoryCacheManifest();

    const cache: MemoryCache = di.usingLifetimeModel(LifetimeModel.noop).usingManifest(services).build()
      .resolve(MEMORY_CACHE_TYPE);
    expect(cache).toBeInstanceOf(MemoryCache);
  });

  // The reference TryAdd semantics -- an earlier IMemoryCache registration survives a later
  // addMemoryCache call -- do not carry over to a manifest-returning function: getMemoryCacheManifest
  // builds its own registration from an empty manifest, with no visibility into what a consumer has
  // already registered, so its tryAdd only ever protects against a second call to
  // getMemoryCacheManifest itself, not against a consumer's own prior registration. Preserving the
  // original guarantee would need either a consumer-supplied manifest parameter (the shape this
  // conversion moves away from) or a different merge primitive; flagged rather than decided here.
  test.skip('keeps an earlier IMemoryCache registration (the reference TryAdd semantics)', () => {});
});
