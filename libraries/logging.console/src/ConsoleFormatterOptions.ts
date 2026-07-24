/** Options for the built-in console log formatters. */
export class ConsoleFormatterOptions {
  /** Whether scopes are included. Defaults to `false`. */
  public includeScopes = false;

  /**
   * The format string used to format timestamps in logging messages —
   * interpreted with the ./date-format token subset. `undefined` (the
   * default) writes no timestamp.
   */
  public timestampFormat: string | undefined = undefined;

  /**
   * Whether the UTC timezone should be used to format timestamps. Defaults to
   * `false` (local time).
   */
  public useUtcTimestamp = false;
}
