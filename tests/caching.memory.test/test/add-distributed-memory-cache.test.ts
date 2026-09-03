// getDistributedMemoryCacheManifest: the registration a consumer merges into
// their own manifest to add IDistributedCache, the options-assembly pipeline,
// and the resolved singleton's end-to-end behavior.

import { DISTRIBUTED_CACHE_TYPE, getDistributedMemoryCacheManifest, MemoryDistributedCache, MemoryDistributedCacheOptions } from '@rhombus-std/caching.memory';
import { Builder, standardLifetime } from '@rhombus-std/di';
import { type Manifest } from '@rhombus-std/di.core';
import { describe, expect, test } from 'bun:test';

describe('getDistributedMemoryCacheManifest', () => {
  test('registers a resolvable IDistributedCache singleton', async () => {
    const services = getDistributedMemoryCacheManifest();

    const provider = Builder.withServices(() => services).useAddon(standardLifetime()).build();
    const cache: MemoryDistributedCache = provider.resolve(DISTRIBUTED_CACHE_TYPE);
    expect(cache).toBeInstanceOf(MemoryDistributedCache);
    // Singleton: the same instance on every resolve.
    const cacheAgain: MemoryDistributedCache = provider.resolve(DISTRIBUTED_CACHE_TYPE);
    expect(cacheAgain).toBe(cache);

    // The resolved cache actually works.
    await cache.setString('key', 'value');
    expect(await cache.getString('key')).toBe('value');
  });

  test('setup joins the options pipeline lazily', () => {
    let seen: MemoryDistributedCacheOptions | undefined;

    // The annotation pins what the function gives back: the manifest it
    // produced, which the resolve below reads an explicit type argument off.
    const returned: Manifest<unknown> = getDistributedMemoryCacheManifest((options) => {
      seen = options;
    });

    // Lazy setup (the reference Configure(setupAction) composition): the
    // configure step runs when the options resolve, not at registration.
    expect(seen).toBeUndefined();

    const cache: MemoryDistributedCache = Builder.withServices(() => returned).build()
      .resolve(DISTRIBUTED_CACHE_TYPE);
    expect(cache).toBeInstanceOf(MemoryDistributedCache);
    expect(seen).toBeInstanceOf(MemoryDistributedCacheOptions);
  });
});
