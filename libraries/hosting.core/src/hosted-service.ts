import type { AbortSignal } from "@rhombus-std/primitives";

/** Defines methods for objects that are managed by the host. */
export interface IHostedService {
  /**
   * Triggered when the application host is ready to start the service.
   *
   * @param abortSignal Indicates that the start process has been aborted.
   */
  start(abortSignal: AbortSignal): Promise<void>;

  /**
   * Triggered when the application host is performing a graceful shutdown.
   *
   * @param abortSignal Indicates that the shutdown process should no
   * longer be graceful.
   */
  stop(abortSignal: AbortSignal): Promise<void>;
}
