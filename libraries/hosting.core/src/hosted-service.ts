/** Defines methods for objects that are managed by the host. */
export interface IHostedService {
  /**
   * Triggered when the application host is ready to start the service.
   *
   * @param cancellationToken Indicates that the start process has been aborted.
   */
  start(cancellationToken: AbortSignal): Promise<void>;

  /**
   * Triggered when the application host is performing a graceful shutdown.
   *
   * @param cancellationToken Indicates that the shutdown process should no
   * longer be graceful.
   */
  stop(cancellationToken: AbortSignal): Promise<void>;
}
