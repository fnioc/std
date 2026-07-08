import type { IHostedService } from "./hosted-service";

/**
 * Defines methods that are run before or after {@link IHostedService.start} and
 * {@link IHostedService.stop}.
 */
export interface IHostedLifecycleService extends IHostedService {
  /**
   * Triggered before {@link IHostedService.start}.
   *
   * @param cancellationToken Indicates that the start process has been aborted.
   */
  starting(cancellationToken: AbortSignal): Promise<void>;

  /**
   * Triggered after {@link IHostedService.start}.
   *
   * @param cancellationToken Indicates that the start process has been aborted.
   */
  started(cancellationToken: AbortSignal): Promise<void>;

  /**
   * Triggered before {@link IHostedService.stop}.
   *
   * @param cancellationToken Indicates that the stop process has been aborted.
   */
  stopping(cancellationToken: AbortSignal): Promise<void>;

  /**
   * Triggered after {@link IHostedService.stop}.
   *
   * @param cancellationToken Indicates that the stop process has been aborted.
   */
  stopped(cancellationToken: AbortSignal): Promise<void>;
}
