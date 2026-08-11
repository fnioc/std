// addDistributedMemoryCache: the ServiceManifest registration member appended
// to ServiceManifestMemoryCacheAugmentations -- both the standalone member and
// the registry-installed method form (docs §38), and the resolved singleton's
// end-to-end behavior.

import { DISTRIBUTED_CACHE_TOKEN, MemoryDistributedCache, MemoryDistributedCacheOptions,
  ServiceManifestMemoryCacheAugmentations } from '@rhombus-std/caching.memory';
// Side-effect: installs `build` onto di.core's Manifest.
import '@rhombus-std/di';
import { DefaultManifest, type Manifest, Type } from '@rhombus-std/di.core';
import { describe, expect, test } from 'bun:test';

describe('addDistributedMemoryCache', () => {
  test('method form registers a resolvable IDistributedCache singleton', async () => {
    const services = new DefaultManifest<'singleton'>();
    const registered = services.addDistributedMemoryCache();

    // Immutable chain: the verb hands back a NEW manifest carrying the
    // registration, and leaves the receiver alone -- the untouched receiver
    // yields no entries at all.
    expect(registered).not.toBe(services);
    expect([...services]).toHaveLength(0);

    const scope = registered.build().createScope('singleton');
    const cache: MemoryDistributedCache = scope.getRequiredService(Type.from(DISTRIBUTED_CACHE_TOKEN));
    expect(cache).toBeInstanceOf(MemoryDistributedCache);
    // Singleton: the same instance on every resolve.
    const cacheAgain: MemoryDistributedCache = scope.getRequiredService(Type.from(DISTRIBUTED_CACHE_TOKEN));
    expect(cacheAgain).toBe(cache);

    // The resolved cache actually works.
    await cache.setString('key', 'value');
    expect(await cache.getString('key')).toBe('value');
  });

  test('standalone member form matches, and setup joins the options pipeline lazily', () => {
    // The standalone member's receiver is the concrete, scope-generic
    // DefaultManifest<string>.
    const services = new DefaultManifest<string>();
    let seen: MemoryDistributedCacheOptions | undefined;

    // Annotated: an AugmentationSet2-typed member's return widens to `any`, and a
    // resolve off `any` cannot take an explicit type argument.
    const returned: Manifest<string> = ServiceManifestMemoryCacheAugmentations
      .addDistributedMemoryCache(services, (options) => {
        seen = options;
      });

    // Same immutability contract through the standalone form.
    expect(returned).not.toBe(services);
    // Lazy setup (the reference Configure(setupAction) composition): the
    // configure step runs when the options resolve, not at registration.
    expect(seen).toBeUndefined();

    const cache: MemoryDistributedCache = returned.build().createScope('singleton')
      .getRequiredService(Type.from(DISTRIBUTED_CACHE_TOKEN));
    expect(cache).toBeInstanceOf(MemoryDistributedCache);
    expect(seen).toBeInstanceOf(MemoryDistributedCacheOptions);
  });
});
