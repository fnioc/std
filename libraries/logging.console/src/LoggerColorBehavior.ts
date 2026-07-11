// LoggerColorBehavior — when to use color when logging messages, ported from
// the reference `LoggerColorBehavior` enum.

/** Describes when to use color when logging messages. */
export enum LoggerColorBehavior {
  /**
   * Use the default color behavior: color is enabled except when the console
   * output is redirected (not a TTY), and the conventional `NO_COLOR` /
   * `FORCE_COLOR` environment variables override the TTY detection.
   */
  Default = 0,

  /** Enable color for logging. */
  Enabled = 1,

  /** Disable color for logging. */
  Disabled = 2,
}
