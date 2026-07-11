// PostEvictionCallbackRegistration -- ported from ME.Caching.Abstractions'
// PostEvictionCallbackRegistration. Pairs a PostEvictionDelegate with the
// state to hand it.

import type { PostEvictionDelegate } from './PostEvictionDelegate';

/** Pairs a {@link PostEvictionDelegate} with the state passed to it on eviction. */
export class PostEvictionCallbackRegistration {
  /** The callback fired after an entry is evicted from the cache. */
  public evictionCallback: PostEvictionDelegate | undefined;

  /** The state passed to {@link evictionCallback}. */
  public state: unknown;
}
