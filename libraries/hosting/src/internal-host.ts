// Host -- the internal `IHost` implementation, ported from the reference hosting
// runtime's `Internal/Host.cs`.
//
// Lives in `internal-host.ts` (not `host.ts`) because `host.ts` already holds
// the static `Host` builder facade from the prior stage; the reference names
// both `Host` in distinct namespaces, which this repo's flat file layout cannot.
//
// Frameless-provider handling (this repo's DI, decisions.md): `build()` returns
// a frameless provider whose singleton registrations only cache once a
// `"singleton"` scope is open. So `start` opens `createScope("singleton")`,
// resolves the hosted services from THAT scope, and `stop` disposes it -- that
// scope is what gives singleton semantics and deterministic disposal.

import type { Resolver, ServiceProvider } from "@rhombus-std/di.core";
import { BackgroundService } from "@rhombus-std/hosting.core";
import type {
  IHost,
  IHostApplicationLifetime,
  IHostedLifecycleService,
  IHostedService,
  IHostLifetime,
} from "@rhombus-std/hosting.core";
import { HOST_AUGMENTATION_TOKEN, hostedServiceCollectionToken } from "@rhombus-std/hosting.core";
import type { ILogger } from "@rhombus-std/logging.core";
import { augment } from "@rhombus-std/primitives";
import type { Func } from "@rhombus-toolkit/func";
import { ApplicationLifetime } from "./application-lifetime";
import { BackgroundServiceExceptionBehavior } from "./background-service-exception-behavior";
import type { HostOptions } from "./host-options";
import {
  backgroundServiceFaulted,
  backgroundServiceStoppingHost,
  hostedServiceStartupFaulted,
  hostStarted,
  hostStarting,
  hostStopped,
  hostStoppedWithException,
  hostStopping,
} from "./logger-messages";
import { linkSignals, whenAborted } from "./signal-linking";

// Re-export the shared hosted-service token so a white-box consumer can reach it
// alongside the host. The value is hosting.core's token (the one
// `addHostedService` registers under) so registration and resolution agree.
export { HOSTED_SERVICE_TOKEN } from "@rhombus-std/hosting.core";

/** Structural test for {@link IHostedLifecycleService}. */
function isHostedLifecycleService(service: IHostedService): service is IHostedLifecycleService {
  const candidate = service as Partial<IHostedLifecycleService>;
  return typeof candidate.starting === "function"
    && typeof candidate.started === "function"
    && typeof candidate.stopping === "function"
    && typeof candidate.stopped === "function";
}

/** Collects the hosted services that also implement the lifecycle interface. */
function getHostLifecycles(hostedServices: readonly IHostedService[]): IHostedLifecycleService[] | undefined {
  let result: IHostedLifecycleService[] | undefined;
  for (const hostedService of hostedServices) {
    if (isHostedLifecycleService(hostedService)) {
      result ??= [];
      result.push(hostedService);
    }
  }
  return result;
}

/**
 * Runs `operation` over `services`. When `concurrent`, all operations are kicked
 * and awaited together; otherwise they run in order and, when
 * `abortOnFirstException`, stop after the first failure. Every failure is
 * collected into `exceptions` rather than thrown.
 */
async function foreachService<T>(
  services: readonly T[],
  signal: AbortSignal,
  concurrent: boolean,
  abortOnFirstException: boolean,
  exceptions: unknown[],
  operation: Func<[T, AbortSignal], Promise<void>>,
): Promise<void> {
  if (concurrent) {
    const results = await Promise.allSettled(services.map((service) => operation(service, signal)));
    for (const result of results) {
      if (result.status === "rejected") {
        exceptions.push(result.reason);
      }
    }
    return;
  }

  for (const service of services) {
    try {
      await operation(service, signal);
    } catch (error) {
      exceptions.push(error);
      if (abortOnFirstException) {
        return;
      }
    }
  }
}

/** Builds the error to throw for a batch of collected `exceptions`. */
function aggregate(exceptions: readonly unknown[], message: string): unknown {
  return exceptions.length === 1 ? exceptions[0] : new AggregateError(exceptions, message);
}

/** The internal {@link IHost} implementation. */
@augment(HOST_AUGMENTATION_TOKEN)
export class Host implements IHost, AsyncDisposable {
  readonly #services: ServiceProvider;
  readonly #applicationLifetime: ApplicationLifetime;
  readonly #logger: ILogger;
  readonly #hostLifetime: IHostLifetime;
  readonly #options: HostOptions;

  #singletonScope?: ServiceProvider;
  #hostedServices?: IHostedService[];
  #hostedLifecycleServices?: IHostedLifecycleService[];
  #hostStarting = false;
  #backgroundServiceTasks?: Promise<void>[];
  #backgroundServiceExceptions?: unknown[];

  public constructor(
    services: ServiceProvider,
    applicationLifetime: IHostApplicationLifetime,
    logger: ILogger,
    hostLifetime: IHostLifetime,
    options: HostOptions,
  ) {
    if (!(applicationLifetime instanceof ApplicationLifetime)) {
      throw new Error("Replacing IHostApplicationLifetime is not supported.");
    }
    this.#services = services;
    this.#applicationLifetime = applicationLifetime;
    this.#logger = logger;
    this.#hostLifetime = hostLifetime;
    this.#options = options;
  }

  /** The services configured for the program (the non-generic resolver view). */
  public get services(): Resolver {
    return this.#services;
  }

  /**
   * Starts the hosted services. Order: host lifetime wait -> open the singleton
   * scope + resolve hosted services -> `starting` -> `start` -> `started` ->
   * fire `applicationStarted`.
   */
  public async start(abortSignal?: AbortSignal): Promise<void> {
    hostStarting(this.#logger);

    const sources = abortSignal
      ? [abortSignal, this.#applicationLifetime.applicationStopping]
      : [this.#applicationLifetime.applicationStopping];
    const linked = linkSignals(sources, this.#options.startupTimeout);
    const signal = linked.signal;

    try {
      await this.#hostLifetime.waitForStart(signal);
      signal.throwIfAborted();

      const exceptions: unknown[] = [];
      this.#hostStarting = true;
      const concurrent = this.#options.servicesStartConcurrently;
      const abortOnFirstException = !concurrent;

      const logAndRethrow = (): void => {
        if (!exceptions.length) {
          return;
        }
        const error = aggregate(exceptions, "One or more hosted services failed to start.");
        hostedServiceStartupFaulted(this.#logger, error);
        throw error;
      };

      // Open the singleton scope and resolve the hosted services from it.
      this.#singletonScope = this.#services.createScope("singleton");
      this.#hostedServices = this.#singletonScope.resolve<IHostedService[]>(hostedServiceCollectionToken());
      this.#hostedLifecycleServices = getHostLifecycles(this.#hostedServices);

      // starting()
      if (this.#hostedLifecycleServices) {
        await foreachService(
          this.#hostedLifecycleServices,
          signal,
          concurrent,
          abortOnFirstException,
          exceptions,
          (service, innerSignal) => service.starting(innerSignal),
        );
        logAndRethrow();
      }

      // start()
      await foreachService(
        this.#hostedServices,
        signal,
        concurrent,
        abortOnFirstException,
        exceptions,
        async (service, innerSignal) => {
          await service.start(innerSignal);
          if (service instanceof BackgroundService) {
            const monitor = this.#tryExecuteBackgroundService(service);
            (this.#backgroundServiceTasks ??= []).push(monitor);
          }
        },
      );
      logAndRethrow();

      // started()
      if (this.#hostedLifecycleServices) {
        await foreachService(
          this.#hostedLifecycleServices,
          signal,
          concurrent,
          abortOnFirstException,
          exceptions,
          (service, innerSignal) => service.started(innerSignal),
        );
      }
      logAndRethrow();

      this.#applicationLifetime.notifyStarted();
    } finally {
      linked[Symbol.dispose]();
    }

    hostStarted(this.#logger);
  }

  /**
   * Stops the hosted services in reverse order. Order: `stopping` -> fire
   * `applicationStopping` -> `stop` -> `stopped` -> fire `applicationStopped` ->
   * host lifetime stop -> dispose the singleton scope.
   */
  public async stop(abortSignal?: AbortSignal): Promise<void> {
    hostStopping(this.#logger);

    const sources = abortSignal ? [abortSignal] : [];
    const linked = linkSignals(sources, this.#options.shutdownTimeout);
    const signal = linked.signal;

    try {
      const exceptions: unknown[] = [];

      if (!this.#hostStarting) {
        // Host was never started; just fire applicationStopping.
        this.#applicationLifetime.stopApplication();
      } else {
        const hostedServices = this.#hostedServices ?? [];
        const reversedServices = [...hostedServices].reverse();
        const reversedLifecycleServices = this.#hostedLifecycleServices
          ? [...this.#hostedLifecycleServices].reverse()
          : undefined;
        const concurrent = this.#options.servicesStopConcurrently;

        // stopping()
        if (reversedLifecycleServices) {
          await foreachService(
            reversedLifecycleServices,
            signal,
            concurrent,
            false,
            exceptions,
            (service, innerSignal) => service.stopping(innerSignal),
          );
        }

        // Fire applicationStopping.
        this.#applicationLifetime.stopApplication();

        // stop()
        await foreachService(
          reversedServices,
          signal,
          concurrent,
          false,
          exceptions,
          (service, innerSignal) => service.stop(innerSignal),
        );

        // stopped()
        if (reversedLifecycleServices) {
          await foreachService(
            reversedLifecycleServices,
            signal,
            concurrent,
            false,
            exceptions,
            (service, innerSignal) => service.stopped(innerSignal),
          );
        }
      }

      // Fire applicationStopped.
      this.#applicationLifetime.notifyStopped();

      try {
        await this.#hostLifetime.stop(signal);
      } catch (error) {
        exceptions.push(error);
      }

      // Let the background-service monitors settle so their exceptions are visible.
      if (this.#backgroundServiceTasks) {
        await Promise.race([Promise.allSettled(this.#backgroundServiceTasks), whenAborted(signal)]);
      }
      if (this.#backgroundServiceExceptions) {
        exceptions.push(...this.#backgroundServiceExceptions);
      }

      // Dispose the singleton scope opened in start().
      if (this.#singletonScope) {
        await this.#singletonScope.disposeAsync();
        this.#singletonScope = undefined;
      }

      if (exceptions.length) {
        const error = aggregate(
          exceptions,
          "One or more hosted services failed to stop, or a background service threw an exception.",
        );
        hostStoppedWithException(this.#logger, error);
        throw error;
      }
    } finally {
      linked[Symbol.dispose]();
    }

    hostStopped(this.#logger);
  }

  /**
   * Awaits a background service's execute task, applying the configured
   * {@link BackgroundServiceExceptionBehavior} on an unhandled failure. Never
   * throws -- collected exceptions surface from {@link stop}.
   */
  async #tryExecuteBackgroundService(backgroundService: BackgroundService): Promise<void> {
    const backgroundTask = backgroundService.executeTask;
    if (backgroundTask === undefined) {
      return;
    }

    try {
      await backgroundTask;
    } catch (error) {
      // A cancellation caused by host shutdown is not an error condition.
      if (this.#applicationLifetime.applicationStopping.aborted) {
        return;
      }

      backgroundServiceFaulted(this.#logger, error);
      if (this.#options.backgroundServiceExceptionBehavior === BackgroundServiceExceptionBehavior.StopHost) {
        backgroundServiceStoppingHost(this.#logger, error);
        (this.#backgroundServiceExceptions ??= []).push(error);
        this.#applicationLifetime.stopApplication();
      }
    }
  }

  /** Disposes the host synchronously: the singleton scope, then the root provider. */
  public [Symbol.dispose](): void {
    if (this.#singletonScope) {
      this.#singletonScope.dispose();
      this.#singletonScope = undefined;
    }
    this.#services.dispose();
  }

  /** Disposes the host asynchronously: the singleton scope, then the root provider. */
  public async [Symbol.asyncDispose](): Promise<void> {
    if (this.#singletonScope) {
      await this.#singletonScope.disposeAsync();
      this.#singletonScope = undefined;
    }
    await this.#services.disposeAsync();
  }
}
