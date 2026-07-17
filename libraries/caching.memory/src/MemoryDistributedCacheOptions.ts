// MemoryDistributedCacheOptions -- ported from ME.Caching.Memory's
// MemoryDistributedCacheOptions: a MemoryCacheOptions whose size limit
// defaults to 200 MB (the memory-backed IDistributedCache sizes each entry by
// its byte length, so the default bounds the cache at 200 MB of payload).

import type { IOptions } from '@rhombus-std/options';
import { MemoryCacheOptions } from './MemoryCacheOptions';

/** Options for a {@link MemoryDistributedCache}. */
export class MemoryDistributedCacheOptions extends MemoryCacheOptions
  implements IOptions<MemoryDistributedCacheOptions>
{
  public constructor() {
    super();
    // Default size limit of 200 MB.
    this.sizeLimit = 200 * 1024 * 1024;
  }

  /** Self-referential accessor, re-narrowed to the subclass. */
  public override get value(): MemoryDistributedCacheOptions {
    return this;
  }
}
