// Lives in caching.memory (not caching.core): MemoryCache and
// MemoryCacheOptions are its only consumers.

/** Abstracts the system clock to facilitate testing expiration. */
export interface ISystemClock {
  /** The current system time in UTC. */
  readonly utcNow: Date;
}
