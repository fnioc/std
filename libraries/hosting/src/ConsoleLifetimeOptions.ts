// ConsoleLifetimeOptions -- ported from the reference hosting runtime's option
// flags for the console lifetime.

/** Provides option flags for the console {@link import("./internal/console-lifetime").ConsoleLifetime}. */
export class ConsoleLifetimeOptions {
  /**
   * Indicates whether host lifetime status messages (such as the startup
   * banner) should be suppressed. Defaults to `false`.
   */
  public suppressStatusMessages = false;
}
