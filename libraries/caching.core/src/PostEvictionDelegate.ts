import type { Func } from '@rhombus-toolkit/types';

import type { EvictionReason } from './EvictionReason';

/** The callback invoked after a cache entry is evicted. */
export type PostEvictionDelegate = Func<[key: unknown, value: unknown, reason: EvictionReason, state: unknown], void>;
