/** Specifies how items are prioritized for preservation during a compaction. */
export enum CacheItemPriority {
  /** Remove as soon as possible during a compaction. */
  Low,

  /** Remove only if there are no other low-priority entries. */
  Normal,

  /** Remove only if there are no other low- or normal-priority entries. */
  High,

  /** Never remove during a compaction. */
  NeverRemove,
}
