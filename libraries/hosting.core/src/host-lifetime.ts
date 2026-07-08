/** Tracks host lifetime. */
export interface IHostLifetime {
  /**
   * Called at the start of {@link IHost.start}, which waits until it completes
   * before continuing. Can be used to delay startup until signaled by an
   * external event.
   *
   * @param cancellationToken Aborts program start.
   */
  waitForStart(cancellationToken: AbortSignal): Promise<void>;

  /**
   * Called from {@link IHost.stop} to indicate that the host is stopping and
   * it's time to shut down.
   *
   * @param cancellationToken Indicates when the stop should no longer be graceful.
   */
  stop(cancellationToken: AbortSignal): Promise<void>;
}
