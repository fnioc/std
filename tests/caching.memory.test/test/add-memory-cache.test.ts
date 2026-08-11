// addMemoryCache: the ServiceManifest registration member (docs §38) -- the
// method form and the standalone member, the options-assembly pipeline (the
// reference AddOptions + Configure(setupAction) composition: `setup` runs
// LAZILY when the options resolve), and the ILoggerFactory injection.

import { MEMORY_CACHE_OPTIONS_TOKEN, MEMORY_CACHE_TOKEN, MemoryCache, MemoryCacheOptions,
  ServiceManifestMemoryCacheAugmentations } from '@rhombus-std/caching.memory';
// Side-effect: installs `build` onto di.core's Manifest.
import '@rhombus-std/di';
import { DefaultManifest, type Manifest, Type } from '@rhombus-std/di.core';
import { LOGGER_FACTORY_TOKEN, NullLogger } from '@rhombus-std/logging';
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

describe('addMemoryCache', () => {
  test('method form registers a resolvable IMemoryCache singleton', () => {
    let services = new DefaultManifest<'singleton'>();

    services = services.addMemoryCache();

    const scope = services.build().createScope('singleton');
    const cache: MemoryCache = scope.getRequiredService(Type.from(MEMORY_CACHE_TOKEN));
    expect(cache).toBeInstanceOf(MemoryCache);
    // Singleton: the same instance on every resolve.
    const cacheAgain: MemoryCache = scope.getRequiredService(Type.from(MEMORY_CACHE_TOKEN));
    expect(cacheAgain).toBe(cache);

    // The resolved cache actually works.
    cache.set('key', 'value');
    expect(cache.get<string>('key')).toBe('value');
  });

  test('setup joins the options pipeline lazily and configures the cache', () => {
    const services = new DefaultManifest<string>();
    let ran = 0;

    // The manifest is immutable, so `addMemoryCache` hands back a NEW manifest
    // carrying the registrations -- build from `returned`, not `services`.
    // Annotated: an AugmentationSet2-typed member's return widens to `any`, and a
    // resolve off `any` cannot take an explicit type argument.
    const returned: Manifest<string> = ServiceManifestMemoryCacheAugmentations.addMemoryCache(
      services,
      (options) => {
        ran++;
        expect(options).toBeInstanceOf(MemoryCacheOptions);
        options.trackStatistics = true;
      },
    );

    const scope = returned.build().createScope('singleton');
    // Lazy: the configure step has not run at registration/build time.
    expect(ran).toBe(0);

    const cache: MemoryCache = scope.getRequiredService(Type.from(MEMORY_CACHE_TOKEN));
    expect(ran).toBe(1);
    // The configured options reached the cache: statistics are tracked.
    cache.get('absent');
    expect(cache.getCurrentStatistics()?.totalMisses).toBe(1);
  });

  test('the assembled IOptions<MemoryCacheOptions> is itself resolvable at its token', () => {
    let services = new DefaultManifest<'singleton'>();
    services = services.addMemoryCache((options) => {
      options.name = 'configured';
    });

    const scope = services.build().createScope('singleton');
    const options: { value: MemoryCacheOptions; } = scope.getRequiredService(Type.from(MEMORY_CACHE_OPTIONS_TOKEN));
    expect(options.value).toBeInstanceOf(MemoryCacheOptions);
    expect(options.value.name).toBe('configured');
  });

  test('injects the registered ILoggerFactory into the cache', () => {
    let services = new DefaultManifest<'singleton'>();
    const factory = new RecordingLoggerFactory();
    services = services.addValue(LOGGER_FACTORY_TOKEN, factory);
    services = services.addMemoryCache();

    services.build().createScope('singleton').getRequiredService(Type.from(MEMORY_CACHE_TOKEN));

    expect(factory.categories).toEqual(['MemoryCache']);
  });

  test('resolves without a registered ILoggerFactory (null-logger fallback)', () => {
    let services = new DefaultManifest<'singleton'>();
    services = services.addMemoryCache();

    const cache: MemoryCache = services.build().createScope('singleton')
      .getRequiredService(Type.from(MEMORY_CACHE_TOKEN));
    expect(cache).toBeInstanceOf(MemoryCache);
  });

  test('keeps an earlier IMemoryCache registration (the reference TryAdd semantics)', () => {
    let services = new DefaultManifest<'singleton'>();
    const sentinel = { marker: 'pre-registered' };
    services = services.addValue(MEMORY_CACHE_TOKEN, sentinel);

    services = services.addMemoryCache();

    const resolved = services.build().createScope('singleton').getRequiredService(Type.from(MEMORY_CACHE_TOKEN));
    expect(resolved).toBe(sentinel);
  });
});
