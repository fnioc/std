# `@rhombus-std/caching`

`caching.core` (`IMemoryCache`/`ICacheEntry` abstractions, `IDistributedCache`, the `Hybrid/`
abstractions-only subsystem) ← `caching.memory` (a genuinely working `MemoryCache`:
absolute/sliding/change-token expiration, size-limited priority-then-LRU compaction, eviction
callbacks, statistics, plus `MemoryDistributedCache`). Meter/observable-counter metrics hooks stay
unported — no meter/instrument analog exists in this port.

## Justified divergences

None beyond the augmentation pattern — see `docs/features/augmentations.md`.
