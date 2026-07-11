// ConsoleLoggerQueueFullMode — the console logger's queue-overflow behavior,
// ported from the reference `ConsoleLoggerQueueFullMode` enum.

/** Describes the console logger behavior when the queue becomes full. */
export enum ConsoleLoggerQueueFullMode {
  /**
   * Admits new messages even past the queue limit, so no message is lost. The
   * reference blocks the logging threads at the limit; a single-threaded
   * runtime cannot block without also stopping the queue's own drain, so
   * `Wait`'s no-loss intent is preserved by letting the queue grow instead.
   */
  Wait = 0,

  /** Drops new log messages when the queue is full. */
  DropWrite = 1,
}
