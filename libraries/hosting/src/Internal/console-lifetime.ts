// ConsoleLifetime -- ported from the reference hosting runtime's
// `ConsoleLifetime` (+ its POSIX-signal partial). Listens for Ctrl+C / SIGTERM /
// SIGQUIT and initiates a graceful shutdown, and logs the startup banner once
// the application has started.
//
// The reference registers `PosixSignalRegistration` handlers; here they are
// `process.on(...)` listeners, torn down on dispose. The reference reads its
// logger from an `ILoggerFactory` under a fixed lifetime category; the in-repo
// category is {@link HOSTING_LIFETIME_CATEGORY} (no vendor branding).

import type { IHostApplicationLifetime, IHostEnvironment, IHostLifetime } from "@rhombus-std/hosting.core";
import type { ILogger, ILoggerFactory } from "@rhombus-std/logging.core";
import { logInformation, LogLevel } from "@rhombus-std/logging.core";
import type { AbortSignal } from "@rhombus-std/primitives";
import { process } from "@rhombus-std/primitives";
import type { Func } from "@rhombus-toolkit/func";
import type { ConsoleLifetimeOptions } from "../ConsoleLifetimeOptions";

/** The logging category the console lifetime writes its status banner under. */
export const HOSTING_LIFETIME_CATEGORY = "Rhombus.Hosting.Lifetime";

/** The POSIX signals that request a graceful shutdown. */
const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM", "SIGQUIT"] as const;

/** Listens for Ctrl+C or a termination signal and initiates a graceful shutdown. */
export class ConsoleLifetime implements IHostLifetime, Disposable {
  readonly #options: ConsoleLifetimeOptions;
  readonly #environment: IHostEnvironment;
  readonly #applicationLifetime: IHostApplicationLifetime;
  readonly #logger: ILogger;

  #onStarted?: Func<[], void>;
  #onStopping?: Func<[], void>;
  #signalHandler?: Func<[], void>;

  public constructor(
    options: ConsoleLifetimeOptions,
    environment: IHostEnvironment,
    applicationLifetime: IHostApplicationLifetime,
    loggerFactory: ILoggerFactory,
  ) {
    this.#options = options;
    this.#environment = environment;
    this.#applicationLifetime = applicationLifetime;
    this.#logger = loggerFactory.createLogger(HOSTING_LIFETIME_CATEGORY);
  }

  /** Registers the shutdown handlers and (unless suppressed) the banner callbacks. */
  public waitForStart(_abortSignal: AbortSignal): Promise<void> {
    if (!this.#options.suppressStatusMessages) {
      this.#onStarted = () => this.#onApplicationStarted();
      this.#onStopping = () => this.#onApplicationStopping();
      this.#applicationLifetime.applicationStarted.addEventListener("abort", this.#onStarted, { once: true });
      this.#applicationLifetime.applicationStopping.addEventListener("abort", this.#onStopping, { once: true });
    }

    this.#registerShutdownHandlers();

    // Console applications start immediately.
    return Promise.resolve();
  }

  /** No-op: there is nothing to do on the lifetime's stop. */
  public stop(_abortSignal: AbortSignal): Promise<void> {
    return Promise.resolve();
  }

  /** Unregisters the shutdown handlers and detaches the banner callbacks. */
  public [Symbol.dispose](): void {
    this.#unregisterShutdownHandlers();

    if (this.#onStarted) {
      this.#applicationLifetime.applicationStarted.removeEventListener("abort", this.#onStarted);
      this.#onStarted = undefined;
    }
    if (this.#onStopping) {
      this.#applicationLifetime.applicationStopping.removeEventListener("abort", this.#onStopping);
      this.#onStopping = undefined;
    }
  }

  #registerShutdownHandlers(): void {
    const handler = (): void => {
      this.#applicationLifetime.stopApplication();
    };
    this.#signalHandler = handler;
    for (const signal of SHUTDOWN_SIGNALS) {
      process.on(signal, handler);
    }
  }

  #unregisterShutdownHandlers(): void {
    if (this.#signalHandler) {
      for (const signal of SHUTDOWN_SIGNALS) {
        process.off(signal, this.#signalHandler);
      }
      this.#signalHandler = undefined;
    }
  }

  #onApplicationStarted(): void {
    if (this.#logger.isEnabled(LogLevel.Information)) {
      logInformation(this.#logger, "Application started. Press Ctrl+C to shut down.");
      logInformation(this.#logger, `Hosting environment: ${this.#environment.environmentName}`);
      logInformation(this.#logger, `Content root path: ${this.#environment.contentRootPath}`);
    }
  }

  #onApplicationStopping(): void {
    logInformation(this.#logger, "Application is shutting down...");
  }
}
