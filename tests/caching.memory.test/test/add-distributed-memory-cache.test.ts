// getDistributedMemoryCacheManifest: the registration a consumer merges into
// their own manifest to add IDistributedCache, the options-assembly pipeline,
// and the resolved singleton's end-to-end behavior.

import { DISTRIBUTED_CACHE_TYPE, getDistributedMemoryCacheManifest, MemoryDistributedCache, MemoryDistributedCacheOptions } from '@rhombus-std/caching.memory';
import { di } from '@rhombus-std/di';
import { LifetimeModel, type Manifest } from '@rhombus-std/di.core';
import { describe, expect, test } from 'bun:test';

describe('getDistributedMemoryCacheManifest', () => {
  // Needs the standard lifetime model's singleton caching, not yet wired for this suite.
  test.skip('registers a resolvable IDistributedCache singleton', () => {});

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

    const cache: MemoryDistributedCache = di.usingLifetimeModel(LifetimeModel.noop).usingManifest(returned).build()
      .resolve(DISTRIBUTED_CACHE_TYPE);
    expect(cache).toBeInstanceOf(MemoryDistributedCache);
    expect(seen).toBeInstanceOf(MemoryDistributedCacheOptions);
  });
});
