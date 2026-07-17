// BrowserLifetimeOptions — the ConsoleLifetimeOptions analog for the browser
// lifetime (no reference-stack counterpart: the browser lifetime is native to
// this port).

/** Options for the {@link import("./BrowserLifetime").BrowserLifetime}. */
export class BrowserLifetimeOptions {
  /**
   * Whether a terminal `pagehide` (persisted === false — the page is being
   * discarded, not frozen into the back/forward cache) requests a graceful
   * shutdown via `IHostApplicationLifetime.stopApplication()`. Defaults to
   * `true`. A persisted pagehide NEVER stops the host regardless of this flag
   * (the page may be restored from the bfcache, and the host is
   * non-restartable).
   *
   * This is a best-effort courtesy shutdown REQUEST, not a guaranteed-complete
   * one; critical persistence belongs on
   * {@link import("./PageLifecycleEvents").PageLifecycleEvents.onFlush}.
   */
  public stopOnPagehide = true;
}
