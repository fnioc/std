// The logging severity levels, ported verbatim from ME.Logging.Abstractions'
// LogLevel. The numeric ordering is load-bearing: `IsEnabled` / filter checks
// compare a message's level against a configured minimum, so Trace=0 … None=6
// must stay in ascending severity order.
//
// This is byte-for-byte the same enum the hosting.core logging stand-in
// declared locally; the integration phase points hosting.core here instead.

/** Defines logging severity levels. */
export enum LogLevel {
  /**
   * Logs that contain the most detailed messages. These may contain sensitive
   * application data and are disabled by default.
   */
  Trace = 0,

  /** Logs used for interactive investigation during development. */
  Debug = 1,

  /** Logs that track the general flow of the application. */
  Information = 2,

  /**
   * Logs that highlight an abnormal or unexpected event that does not otherwise
   * stop application execution.
   */
  Warning = 3,

  /** Logs that highlight when the current flow of execution is stopped by a failure. */
  Error = 4,

  /** Logs that describe an unrecoverable application or system crash. */
  Critical = 5,

  /** Not used for writing log messages — specifies that a category should write nothing. */
  None = 6,
}
