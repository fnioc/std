// addDistributedMemoryCache: the ServiceManifest registration member appended
// to MemoryCacheServiceCollectionExtensions -- both the standalone member and
// the registry-installed method form (docs §38), and the resolved singleton's
// end-to-end behavior.

import { DISTRIBUTED_CACHE_TOKEN, MemoryCacheServiceCollectionExtensions, MemoryDistributedCache,
  MemoryDistributedCacheOptions } from '@rhombus-std/caching.memory';
import { ServiceManifest, ServiceManifestClass } from '@rhombus-std/di';
import { describe, expect, test } from 'bun:test';

describe('addDistributedMemoryCache', () => {
  test('method form registers a resolvable IDistributedCache singleton', async () => {
    const services = new ServiceManifest<'singleton'>();
    const registered = services.addDistributedMemoryCache();

    // Immutable chain: the verb hands back a NEW manifest carrying the
    // registration, and leaves the receiver alone -- the untouched receiver
    // yields no entries at all.
    expect(registered).not.toBe(services);
    expect([...services]).toHaveLength(0);

    const scope = registered.build().createScope('singleton');
    const cache = scope.resolve<MemoryDistributedCache>(DISTRIBUTED_CACHE_TOKEN);
    expect(cache).toBeInstanceOf(MemoryDistributedCache);
    // Singleton: the same instance on every resolve.
    expect(scope.resolve<MemoryDistributedCache>(DISTRIBUTED_CACHE_TOKEN)).toBe(cache);

    // The resolved cache actually works.
    await cache.setString('key', 'value');
    expect(await cache.getString('key')).toBe('value');
  });

  test('standalone member form matches, and setup joins the options pipeline lazily', () => {
    // The standalone member's receiver is the concrete, scope-generic
    // ServiceManifestClass<string> (the public `ServiceManifest` value IS that
    // class, but its constructor types instances as the base interface).
    const services = new ServiceManifestClass<string>();
    let seen: MemoryDistributedCacheOptions | undefined;

    const returned = MemoryCacheServiceCollectionExtensions.addDistributedMemoryCache(services, (options) => {
      seen = options;
    });

    // Same immutability contract through the standalone form.
    expect(returned).not.toBe(services);
    // Lazy setup (the reference Configure(setupAction) composition): the
    // configure step runs when the options resolve, not at registration.
    expect(seen).toBeUndefined();

    const cache = returned.build().createScope('singleton').resolve<MemoryDistributedCache>(DISTRIBUTED_CACHE_TOKEN);
    expect(cache).toBeInstanceOf(MemoryDistributedCache);
    expect(seen).toBeInstanceOf(MemoryDistributedCacheOptions);
  });
});
