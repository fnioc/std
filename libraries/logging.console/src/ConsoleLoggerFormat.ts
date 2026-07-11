// ConsoleLoggerFormat — the deprecated pre-formatter format selector, ported
// from the reference `ConsoleLoggerFormat` enum (marked obsolete upstream; the
// deprecation is preserved).

/**
 * Describes the format of console logger messages.
 *
 * @deprecated `ConsoleLoggerFormat` has been deprecated — use
 * {@link ConsoleLoggerOptions.formatterName} instead.
 */
export enum ConsoleLoggerFormat {
  /** Produce messages in the default console format. */
  Default = 0,

  /** Produce messages in a format suitable for console output to the systemd journal. */
  Systemd = 1,
}
