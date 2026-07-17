// Host -- the internal `IHost` implementation, ported from the reference hosting
// runtime's `Internal/Host.cs`.
//
// Lives in `internal/Host.ts` (not `src/Host.ts`) because `src/Host.ts` already
// holds the static `Host` builder facade from the prior stage; the reference
// names both `Host`, in distinct namespaces, and mirroring its `Internal/`
// directory keeps the two apart here too.
//
// Frameless-provider handling (this repo's DI, decisions.md): `build()` returns
// a frameless provider whose singleton registrations only cache once a
// `"singleton"` scope is open. So `start` opens `createScope("singleton")`,
// resolves the hosted services from THAT scope, and `stop` disposes it -- that
// scope is what gives singleton semantics and deterministic disposal.

import type { IResolver, IServiceProvider } from '@rhombus-std/di.core';
import { BackgroundService, hostedServiceCollectionToken, type IHost, type IHostApplicationLifetime,
  type IHostedLifecycleService, type IHostedService, type IHostLifetime } from '@rhombus-std/hosting.core';
import type { ILogger } from '@rhombus-std/logging.core';
import type { IStartupValidator } from '@rhombus-std/options';
import { type AbortSignal, augment } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import { BackgroundServiceErrorBehavior } from '../BackgroundServiceErrorBehavior';
import type { HostOptions } from '../HostOptions';
import { linkSignals, whenAborted } from '../signal-linking';
import { ApplicationLifetime } from './ApplicationLifetime';
import { HostingLoggerExtensions } from './HostingLoggerExtensions';

// Re-export the shared hosted-service token so a white-box consumer can reach it
// alongside the host. The value is hosting.core's token (the one
// `addHostedService` registers under) so registration and resolution agree.
export { HOSTED_SERVICE_TOKEN } from '@rhombus-std/hosting.core';

/** Structural test for {@link IHostedLifecycleService}. */
function isHostedLifecycleService(service: IHostedService): service is IHostedLifecycleService {
  const candidate = service as Partial<IHostedLifecycleService>;
  return typeof candidate.starting === 'function'
    && typeof candidate.started === 'function'
    && typeof candidate.stopping === 'function'
    && typeof candidate.stopped === 'function';
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
 * `abortOnFirstError`, stop after the first failure. Every failure is
 * collected into `errors` rather than thrown.
 */
async function foreachService<T>(
  services: readonly T[],
  signal: AbortSignal,
  concurrent: boolean,
  abortOnFirstError: boolean,
  errors: unknown[],
  operation: Func<[T, AbortSignal], Promise<void>>,
): Promise<void> {
  if (concurrent) {
    const results = await Promise.allSettled(services.map((service) => operation(service, signal)));
    for (const result of results) {
      if (result.status === 'rejected') {
        errors.push(result.reason);
      }
    }
    return;
  }

  for (const service of services) {
    try {
      await operation(service, signal);
    } catch (error) {
      errors.push(error);
      if (abortOnFirstError) {
        return;
      }
    }
  }
}

/** Builds the error to throw for a batch of collected `errors`. */
function aggregate(errors: readonly unknown[], message: string): unknown {
  return errors.length === 1 ? errors[0] : new AggregateError(errors, message);
}

// Interface-extends merge (augmentation doctrine): binding the IHost SYMBOL flows
// every in-program augmentation of the interface (hosting.core's run/waitFor…/stop
// members) onto this concrete holder, so it satisfies `implements IHost` without
// restating any member.
export interface Host extends IHost {}

/** The internal {@link IHost} implementation. */
@augment(nameof<IHost>())
export class Host implements IHost, AsyncDisposable {
  readonly #services: IServiceProvider;
  readonly #applicationLifetime: ApplicationLifetime;
  readonly #logger: ILogger;
  readonly #hostLifetime: IHostLifetime;
  readonly #options: HostOptions;

  #singletonScope?: IServiceProvider;
  #hostedServices?: IHostedService[];
  #hostedLifecycleServices?: IHostedLifecycleService[];
  #hostStarting = false;
  #backgroundServiceTasks?: Promise<void>[];
  #backgroundServiceErrors?: unknown[];

  public constructor(
    services: IServiceProvider,
    applicationLifetime: IHostApplicationLifetime,
    logger: ILogger,
    hostLifetime: IHostLifetime,
    options: HostOptions,
  ) {
    if (!(applicationLifetime instanceof ApplicationLifetime)) {
      throw new Error('Replacing IHostApplicationLifetime is not supported.');
    }
    this.#services = services;
    this.#applicationLifetime = applicationLifetime;
    this.#logger = logger;
    this.#hostLifetime = hostLifetime;
    this.#options = options;
  }

  /** The services configured for the program (the non-generic resolver view). */
  public get services(): IResolver {
    return this.#services;
  }

  /**
   * Starts the hosted services. Order: host lifetime wait -> open the singleton
   * scope + resolve hosted services -> `starting` -> `start` -> `started` ->
   * fire `applicationStarted`.
   */
  public async start(abortSignal?: AbortSignal): Promise<void> {
    HostingLoggerExtensions.starting(this.#logger);

    const sources = abortSignal
      ? [abortSignal, this.#applicationLifetime.applicationStopping]
      : [this.#applicationLifetime.applicationStopping];
    const linked = linkSignals(sources, this.#options.startupTimeout);
    const signal = linked.signal;

    try {
      await this.#hostLifetime.waitForStart(signal);
      signal.throwIfAborted();

      const errors: unknown[] = [];
      this.#hostStarting = true;
      const concurrent = this.#options.servicesStartConcurrently;
      const abortOnFirstError = !concurrent;

      const logAndRethrow = (): void => {
        if (!errors.length) {
          return;
        }
        const error = aggregate(errors, 'One or more hosted services failed to start.');
        HostingLoggerExtensions.hostedServiceStartupFaulted(this.#logger, error);
        throw error;
      };

      // Open the singleton scope and resolve the hosted services from it.
      this.#singletonScope = this.#services.createScope('singleton');
      const singletonScope = this.#singletonScope;
      this.#hostedServices = singletonScope.resolve<IHostedService[]>(hostedServiceCollectionToken());
      this.#hostedLifecycleServices = getHostLifecycles(this.#hostedServices);

      // Force eager validation of any options marked with `validateOnStart`
      // (reference Host order: after resolving hosted services, before
      // starting()). The validator is registered only when `validateOnStart`
      // ran, so resolve it optionally; a validation failure throws out of start.
      const startupValidator = singletonScope.tryResolve<IStartupValidator>(nameof<IStartupValidator>());
      startupValidator?.validate();

      // starting()
      if (this.#hostedLifecycleServices) {
        await foreachService(
          this.#hostedLifecycleServices,
          signal,
          concurrent,
          abortOnFirstError,
          errors,
          (service, innerSignal) => service.starting(innerSignal),
        );
        logAndRethrow();
      }

      // start()
      await foreachService(
        this.#hostedServices,
        signal,
        concurrent,
        abortOnFirstError,
        errors,
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
          abortOnFirstError,
          errors,
          (service, innerSignal) => service.started(innerSignal),
        );
      }
      logAndRethrow();

      this.#applicationLifetime.notifyStarted();
    } finally {
      linked[Symbol.dispose]();
    }

    HostingLoggerExtensions.started(this.#logger);
  }

  /**
   * Stops the hosted services in reverse order. Order: `stopping` -> fire
   * `applicationStopping` -> `stop` -> `stopped` -> fire `applicationStopped` ->
   * host lifetime stop -> dispose the singleton scope.
   */
  public async stop(abortSignal?: AbortSignal): Promise<void> {
    HostingLoggerExtensions.stopping(this.#logger);

    const sources = abortSignal ? [abortSignal] : [];
    const linked = linkSignals(sources, this.#options.shutdownTimeout);
    const signal = linked.signal;

    try {
      const errors: unknown[] = [];

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
            errors,
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
          errors,
          (service, innerSignal) => service.stop(innerSignal),
        );

        // stopped()
        if (reversedLifecycleServices) {
          await foreachService(
            reversedLifecycleServices,
            signal,
            concurrent,
            false,
            errors,
            (service, innerSignal) => service.stopped(innerSignal),
          );
        }
      }

      // Fire applicationStopped.
      this.#applicationLifetime.notifyStopped();

      try {
        await this.#hostLifetime.stop(signal);
      } catch (error) {
        errors.push(error);
      }

      // Let the background-service monitors settle so their errors are visible.
      if (this.#backgroundServiceTasks) {
        await Promise.race([Promise.allSettled(this.#backgroundServiceTasks), whenAborted(signal)]);
      }
      if (this.#backgroundServiceErrors) {
        errors.push(...this.#backgroundServiceErrors);
      }

      // Dispose the singleton scope opened in start().
      if (this.#singletonScope) {
        await this.#singletonScope.disposeAsync();
        this.#singletonScope = undefined;
      }

      if (errors.length) {
        const error = aggregate(
          errors,
          'One or more hosted services failed to stop, or a background service threw an error.',
        );
        HostingLoggerExtensions.stoppedWithError(this.#logger, error);
        throw error;
      }
    } finally {
      linked[Symbol.dispose]();
    }

    HostingLoggerExtensions.stopped(this.#logger);
  }

  /**
   * Awaits a background service's execute task, applying the configured
   * {@link BackgroundServiceErrorBehavior} on an unhandled failure. Never
   * throws -- collected errors surface from {@link stop}.
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

      HostingLoggerExtensions.backgroundServiceFaulted(this.#logger, error);
      if (this.#options.backgroundServiceErrorBehavior === BackgroundServiceErrorBehavior.StopHost) {
        HostingLoggerExtensions.backgroundServiceStoppingHost(this.#logger, error);
        (this.#backgroundServiceErrors ??= []).push(error);
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
