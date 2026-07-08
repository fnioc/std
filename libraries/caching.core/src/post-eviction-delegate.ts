// PostEvictionDelegate -- ported from ME.Caching.Abstractions'
// PostEvictionDelegate. The callback fired after an entry is evicted.
//
// The reference `object key` / `object? value` map to `unknown`; `object?
// state` (the state captured at registration) maps to `unknown`.

import type { EvictionReason } from "./eviction-reason";

/**
 * The callback method invoked after a cache entry is evicted.
 *
 * @param key The key of the entry being evicted.
 * @param value The value of the entry being evicted.
 * @param reason The {@link EvictionReason}.
 * @param state The state passed when the callback was registered.
 */
export type PostEvictionDelegate = (
  key: unknown,
  value: unknown,
  reason: EvictionReason,
  state: unknown,
) => void;
