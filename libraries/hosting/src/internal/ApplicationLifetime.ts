// ApplicationLifetime -- ported from the reference hosting runtime's
// `ApplicationLifetime` (the `IHostApplicationLifetime` implementation).
//
// The reference backs the three lifecycle signals with `CancellationTokenSource`
// instances; here each is an `AbortController`, and a signal is its
// `AbortController.signal`. Triggering a signal aborts its controller once
// (idempotent). Errors thrown by abort listeners are caught and logged at
// critical severity, mirroring the reference's try/catch around `Cancel()`.

import type { IHostApplicationLifetime } from '@rhombus-std/hosting.core';
import type { ILogger } from '@rhombus-std/logging.core';
import { AbortController, type AbortSignal } from '@rhombus-std/primitives';
import { HostingLoggerExtensions } from './HostingLoggerExtensions';
import { LoggerEventIds } from './LoggerEventIds';

/** Allows consumers to perform cleanup during a graceful shutdown. */
export class ApplicationLifetime implements IHostApplicationLifetime {
  readonly #startedController = new AbortController();
  readonly #stoppingController = new AbortController();
  readonly #stoppedController = new AbortController();
  readonly #logger: ILogger;

  public constructor(logger: ILogger) {
    this.#logger = logger;
  }

  /** Signals when the application has fully started. */
  public get applicationStarted(): AbortSignal {
    return this.#startedController.signal;
  }

  /** Signals when the application is beginning a graceful shutdown. */
  public get applicationStopping(): AbortSignal {
    return this.#stoppingController.signal;
  }

  /** Signals when the application has completed a graceful shutdown. */
  public get applicationStopped(): AbortSignal {
    return this.#stoppedController.signal;
  }

  /** Triggers {@link applicationStopping}. The first call wins; later calls no-op. */
  public stopApplication(): void {
    if (this.#stoppingController.signal.aborted) {
      return;
    }
    try {
      this.#stoppingController.abort();
    } catch (error) {
      HostingLoggerExtensions.applicationError(
        this.#logger,
        LoggerEventIds.applicationStoppingError,
        'An error occurred stopping the application',
        error,
      );
    }
  }

  /** Triggers {@link applicationStarted}. */
  public notifyStarted(): void {
    try {
      this.#startedController.abort();
    } catch (error) {
      HostingLoggerExtensions.applicationError(
        this.#logger,
        LoggerEventIds.applicationStartupError,
        'An error occurred starting the application',
        error,
      );
    }
  }

  /** Triggers {@link applicationStopped}. */
  public notifyStopped(): void {
    try {
      this.#stoppedController.abort();
    } catch (error) {
      HostingLoggerExtensions.applicationError(
        this.#logger,
        LoggerEventIds.applicationStoppedError,
        'An error occurred stopping the application',
        error,
      );
    }
  }
}
