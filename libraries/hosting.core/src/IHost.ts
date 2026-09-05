import type { IServiceProvider } from '@rhombus-std/di.core';
import type { AbortSignal } from '@rhombus-std/primitives';

/**
 * A program abstraction: the running application host, the root object owning
 * the service container and its lifetime.
 *
 * @remarks
 * `services` is the non-generic {@link IServiceProvider} view: a caller resolves
 * through it, but cannot open new scopes off the root handle.
 */
export interface IHost extends Disposable {
  /** The services configured for the program. */
  readonly services: IServiceProvider;

  /**
   * Starts the {@link IHostedService} objects configured for the program. The
   * application runs until interrupted or until
   * `IHostApplicationLifetime.stopApplication` is called.
   *
   * @param abortSignal Aborts program start.
   */
  start(abortSignal?: AbortSignal): Promise<void>;

  /**
   * Attempts to gracefully stop the program.
   *
   * @param abortSignal Indicates when the stop should no longer be graceful.
   */
  stop(abortSignal?: AbortSignal): Promise<void>;
}
