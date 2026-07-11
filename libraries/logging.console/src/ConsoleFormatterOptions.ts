// ConsoleFormatterOptions — options for the built-in console log formatters,
// ported from the reference `ConsoleFormatterOptions`.
//
// The reference `TimestampFormat` is a platform date-time format string; this
// port interprets it with the token subset implemented in ./date-format
// (yyyy/MM/dd/HH/hh/mm/ss/fff/…). The internal `Configure(IConfiguration)`
// binding hook is NOT ported: it rides the provider-configuration pipeline
// (`ILoggerProviderConfiguration<T>` in the logging.configuration analog),
// which does not exist yet — see the residuals note in the package index.

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
