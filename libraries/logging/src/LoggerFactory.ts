// LoggerFactory — produces category loggers by fanning out across the supplied
// providers, ported from ME.Logging's `LoggerFactory`.
//
// Each `createLogger(category)` builds a composite `Logger` over one
// `LoggerInformation` per provider, then runs `applyFilters` — which selects the
// governing `LoggerFilterOptions` rule per (provider, category) via
// `LoggerRuleSelector` — to compute the composite's `messageLoggers` /
// `scopeLoggers`. The filter source is an `Options<LoggerFilterOptions>` (the
// reference's `IOptionsMonitor<LoggerFilterOptions>`): when it is reactive the
// factory re-runs `applyFilters` for every existing logger on each change, so a
// configuration reload re-filters live.
//
// Adaptations from the reference:
//   - `StaticFilterOptionsMonitor` collapses into `Options.of(...)` — the repo's
//     `Options<T>` already unifies the static/monitor split (§4.2), so a raw
//     `LoggerFilterOptions` (or none) is wrapped in a static `Options.of`.
//   - The internal `LoggerFactoryScopeProvider` (activity-tracking) is not
//     ported — activity tracking has no analog here (diagnostics defers it), so
//     the factory's shared scope provider is a plain `LoggerExternalScopeProvider`.
//   - `LoggerFactoryOptions` / `ActivityTrackingOptions` are omitted (same
//     reason); the scope-provider constructor parameter is kept.

import { ServiceManifest, type ServiceProvider } from "@rhombus-std/di";
import {
  type IExternalScopeProvider,
  type ILogger,
  type ILoggerFactory,
  type ILoggerProvider,
  type ILoggingBuilder,
  LogLevel,
} from "@rhombus-std/logging.core";
import { Options } from "@rhombus-std/options";
import type { Func } from "@rhombus-toolkit/func";
import { Logger } from "./logger";
import { LoggerExternalScopeProvider } from "./logger-external-scope-provider";
import { LoggerFilterOptions } from "./logger-filter-options";
import { LoggerInformation, MessageLogger, ScopeLogger } from "./logger-information";
import { LoggerRuleSelector } from "./logger-rule-selector";
import { NullLogger } from "./null-logger";
import { isSupportExternalScope } from "./support-external-scope-guard";
import { LOGGER_FACTORY_TOKEN } from "./tokens";

/** A provider plus whether the factory owns its disposal. */
interface ProviderRegistration {
  provider: ILoggerProvider;
  shouldDispose: boolean;
}

export class LoggerFactory implements ILoggerFactory {
  readonly #loggers = new Map<string, Logger>();
  readonly #providerRegistrations: ProviderRegistration[] = [];
  #filterOptions!: LoggerFilterOptions;
  #scopeProvider: IExternalScopeProvider | undefined;
  #changeSubscription: Disposable | undefined;
  #disposed = false;

  public constructor(
    providers: Iterable<ILoggerProvider> = [],
    filterOptions?: LoggerFilterOptions | Options<LoggerFilterOptions>,
    scopeProvider?: IExternalScopeProvider,
  ) {
    this.#scopeProvider = scopeProvider;

    const source: Options<LoggerFilterOptions> = filterOptions === undefined
      ? Options.of(new LoggerFilterOptions())
      : filterOptions instanceof LoggerFilterOptions
      ? Options.of(filterOptions)
      : filterOptions;

    for (const provider of providers) {
      this.#addProviderRegistration(provider, false);
    }

    this.#changeSubscription = source.subscribe?.((value) => this.#refreshFilters(value));
    this.#refreshFilters(source.value);
  }

  public createLogger(categoryName: string): ILogger {
    this.#throwIfDisposed();

    let logger = this.#loggers.get(categoryName);
    if (logger === undefined) {
      logger = new Logger(categoryName, this.#createLoggers(categoryName));
      this.#applyFiltersTo(logger);
      this.#loggers.set(categoryName, logger);
    }
    return logger;
  }

  public addProvider(provider: ILoggerProvider): void {
    this.#throwIfDisposed();

    this.#addProviderRegistration(provider, true);
    for (const [categoryName, logger] of this.#loggers) {
      logger.loggers = [...logger.loggers, new LoggerInformation(provider, categoryName)];
      this.#applyFiltersTo(logger);
    }
  }

  public [Symbol.dispose](): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#changeSubscription?.[Symbol.dispose]();
    for (const registration of this.#providerRegistrations) {
      try {
        if (registration.shouldDispose) {
          registration.provider[Symbol.dispose]();
        }
      } catch {
        // Swallow exceptions on dispose (reference behavior).
      }
    }
  }

  #throwIfDisposed(): void {
    if (this.#disposed) {
      throw new Error("LoggerFactory has been disposed.");
    }
  }

  /** Registers a provider and, when it consumes external scope, hands it the shared scope provider. */
  #addProviderRegistration(provider: ILoggerProvider, shouldDispose: boolean): void {
    this.#providerRegistrations.push({ provider, shouldDispose });
    if (isSupportExternalScope(provider)) {
      this.#scopeProvider ??= new LoggerExternalScopeProvider();
      provider.setScopeProvider(this.#scopeProvider);
    }
  }

  /** Rebuilds every existing composite's filtered views after a filter-options change. */
  #refreshFilters(filterOptions: LoggerFilterOptions): void {
    this.#filterOptions = filterOptions;
    for (const logger of this.#loggers.values()) {
      this.#applyFiltersTo(logger);
    }
  }

  #createLoggers(categoryName: string): LoggerInformation[] {
    const loggers: LoggerInformation[] = [];
    for (const registration of this.#providerRegistrations) {
      const information = new LoggerInformation(registration.provider, categoryName);
      // A provider that hands back the shared null logger contributes nothing.
      if (information.logger !== NullLogger.instance) {
        loggers.push(information);
      }
    }
    return loggers;
  }

  #applyFiltersTo(logger: Logger): void {
    const messageLoggers: MessageLogger[] = [];
    const scopeLoggers: ScopeLogger[] | undefined = this.#filterOptions.captureScopes ? [] : undefined;

    for (const information of logger.loggers) {
      const { minLevel, filter } = LoggerRuleSelector.select(
        this.#filterOptions,
        information.providerType,
        information.category,
      );

      // A rule selecting a level above Critical (i.e. None) disables the sink
      // entirely — skip it rather than adding a never-enabled message logger.
      if (minLevel !== undefined && minLevel > LogLevel.Critical) {
        continue;
      }

      messageLoggers.push(
        new MessageLogger(information.logger, information.category, information.providerType, minLevel, filter),
      );

      if (!information.externalScope) {
        scopeLoggers?.push(new ScopeLogger(information.logger, undefined));
      }
    }

    if (this.#scopeProvider !== undefined) {
      scopeLoggers?.push(new ScopeLogger(undefined, this.#scopeProvider));
    }

    logger.messageLoggers = messageLoggers;
    logger.scopeLoggers = scopeLoggers;
  }

  /**
   * Creates a configured {@link ILoggerFactory} from an {@link ILoggingBuilder}
   * delegate — the reference `LoggerFactory.Create`. Spins up a
   * {@link ServiceManifest}, runs `addLogging(configure)`, builds the container,
   * opens the singleton scope, and resolves the factory. The returned
   * {@link ILoggerFactory} owns the container: disposing it disposes the scope
   * (and everything it built, the factory included).
   */
  public static create(configure: Func<[ILoggingBuilder], void>): ILoggerFactory {
    const services = new ServiceManifest();
    services.addLogging(configure);
    const provider = services.build();
    const singletonScope = provider.createScope("singleton");
    const factory = singletonScope.resolve<ILoggerFactory>(LOGGER_FACTORY_TOKEN);
    return new DisposingLoggerFactory(factory, singletonScope);
  }
}

/**
 * Wraps a container-resolved {@link ILoggerFactory} so disposing the factory
 * disposes the owning container scope — the reference's `DisposingLoggerFactory`.
 */
class DisposingLoggerFactory implements ILoggerFactory {
  public constructor(
    private readonly factory: ILoggerFactory,
    private readonly scope: ServiceProvider,
  ) {}

  public createLogger(categoryName: string): ILogger {
    return this.factory.createLogger(categoryName);
  }

  public addProvider(provider: ILoggerProvider): void {
    this.factory.addProvider(provider);
  }

  public [Symbol.dispose](): void {
    this.scope[Symbol.dispose]();
  }
}
