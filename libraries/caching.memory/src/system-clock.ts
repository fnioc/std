// ISystemClock -- ported from the reference runtime's internal
// `Microsoft.Extensions.Internal.ISystemClock`. Abstracts the wall clock so a
// test can drive expiration deterministically. The reference `DateTimeOffset
// UtcNow` maps to a `Date` getter.
//
// Ported HERE (in caching.memory, not caching.core) because MemoryCache /
// MemoryCacheOptions are its only consumer -- see MEMORY.md's YAGNI-on-ports
// rule.

/** Abstracts the system clock to facilitate testing expiration. */
export interface ISystemClock {
  /** The current system time in UTC. */
  readonly utcNow: Date;
}
