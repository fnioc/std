// LogMessageEntry — one fully-rendered message queued for writing, ported from
// the reference internal `LogMessageEntry` struct. Internal: not exported from
// the package barrel.

/** A rendered log message plus its output-stream routing flag. */
export interface LogMessageEntry {
  /** The fully-rendered message text (may embed ANSI color codes). */
  readonly message: string;

  /** Whether the message is written to the error console instead of stdout. */
  readonly logAsError: boolean;
}
