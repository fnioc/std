// ApplicationLifetime -- ported from the reference hosting runtime's
// `ApplicationLifetime` (the `IHostApplicationLifetime` implementation).
//
// The reference backs the three lifecycle signals with `CancellationTokenSource`
// instances; here each is an `AbortController`, and a signal is its
// `AbortController.signal`. Triggering a signal aborts its controller once
// (idempotent). Errors thrown by abort listeners are caught and logged at
// critical severity, mirroring the reference's try/catch around `Cancel()`.

import type { IHostApplicationLifetime } from "@rhombus-std/hosting.core";
import type { ILogger } from "@rhombus-std/logging.core";
import { applicationError, LoggerEventIds } from "./logger-messages";

/** Allows consumers to perform cleanup during a graceful shutdown. */
export class ApplicationLifetime implements IHostApplicationLifetime {
  readonly #startedSource = new AbortController();
  readonly #stoppingSource = new AbortController();
  readonly #stoppedSource = new AbortController();
  readonly #logger: ILogger;

  public constructor(logger: ILogger) {
    this.#logger = logger;
  }

  /** Signals when the application has fully started. */
  public get applicationStarted(): AbortSignal {
    return this.#startedSource.signal;
  }

  /** Signals when the application is beginning a graceful shutdown. */
  public get applicationStopping(): AbortSignal {
    return this.#stoppingSource.signal;
  }

  /** Signals when the application has completed a graceful shutdown. */
  public get applicationStopped(): AbortSignal {
    return this.#stoppedSource.signal;
  }

  /** Triggers {@link applicationStopping}. The first call wins; later calls no-op. */
  public stopApplication(): void {
    if (this.#stoppingSource.signal.aborted) {
      return;
    }
    try {
      this.#stoppingSource.abort();
    } catch (error) {
      applicationError(
        this.#logger,
        LoggerEventIds.applicationStoppingException,
        "An error occurred stopping the application",
        error,
      );
    }
  }

  /** Triggers {@link applicationStarted}. */
  public notifyStarted(): void {
    try {
      this.#startedSource.abort();
    } catch (error) {
      applicationError(
        this.#logger,
        LoggerEventIds.applicationStartupException,
        "An error occurred starting the application",
        error,
      );
    }
  }

  /** Triggers {@link applicationStopped}. */
  public notifyStopped(): void {
    try {
      this.#stoppedSource.abort();
    } catch (error) {
      applicationError(
        this.#logger,
        LoggerEventIds.applicationStoppedException,
        "An error occurred stopping the application",
        error,
      );
    }
  }
}
