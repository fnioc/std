import type { AbortSignal } from "@rhombus-std/primitives";
import type { IHostedService } from "./IHostedService";

/**
 * Defines methods that are run before or after {@link IHostedService.start} and
 * {@link IHostedService.stop}.
 */
export interface IHostedLifecycleService extends IHostedService {
  /**
   * Triggered before {@link IHostedService.start}.
   *
   * @param abortSignal Indicates that the start process has been aborted.
   */
  starting(abortSignal: AbortSignal): Promise<void>;

  /**
   * Triggered after {@link IHostedService.start}.
   *
   * @param abortSignal Indicates that the start process has been aborted.
   */
  started(abortSignal: AbortSignal): Promise<void>;

  /**
   * Triggered before {@link IHostedService.stop}.
   *
   * @param abortSignal Indicates that the stop process has been aborted.
   */
  stopping(abortSignal: AbortSignal): Promise<void>;

  /**
   * Triggered after {@link IHostedService.stop}.
   *
   * @param abortSignal Indicates that the stop process has been aborted.
   */
  stopped(abortSignal: AbortSignal): Promise<void>;
}
