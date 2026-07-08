import type { Resolver } from "@rhombus-std/di.core";

/**
 * A program abstraction: the running application host, the root object owning
 * the service container and its lifetime.
 *
 * `services` is the NON-generic {@link Resolver} view (decisions.md §10) -- a
 * host consumer resolves, but does not open new scopes off the root handle.
 */
export interface IHost extends Disposable {
  /** The services configured for the program. */
  readonly services: Resolver;

  /**
   * Starts the {@link IHostedService} objects configured for the program. The
   * application runs until interrupted or until
   * `IHostApplicationLifetime.stopApplication` is called.
   *
   * @param cancellationToken Aborts program start.
   */
  start(cancellationToken?: AbortSignal): Promise<void>;

  /**
   * Attempts to gracefully stop the program.
   *
   * @param cancellationToken Indicates when the stop should no longer be graceful.
   */
  stop(cancellationToken?: AbortSignal): Promise<void>;
}
