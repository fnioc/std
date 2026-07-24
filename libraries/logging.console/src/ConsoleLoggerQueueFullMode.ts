/** Describes the console logger behavior when the queue becomes full. */
export enum ConsoleLoggerQueueFullMode {
  /** Admits new messages past the queue limit rather than blocking — the queue grows without bound so no message is lost. */
  Wait = 0,

  /** Drops new log messages when the queue is full. */
  DropWrite = 1,
}
