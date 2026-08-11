// LoggerFactory produces one composite logger per category, fanning a write
// out across every registered provider.
//
// `createLogger(category)` builds a composite `Logger` over one
// `LoggerInformation` per provider, then runs `applyFilters` — which selects the
// governing `LoggerFilterOptions` rule per (provider, category) via
// `LoggerRuleSelector` — to compute the composite's `messageLoggers` /
// `scopeLoggers`. The filter source is an `IOptions<LoggerFilterOptions>`: when
// it is reactive, the factory re-runs `applyFilters` for every existing logger
// on each change, so a configuration reload re-filters live loggers.

import type { ServiceProvider } from '@rhombus-std/di';
import { DefaultManifest } from '@rhombus-std/di.core';
import { type IExternalScopeProvider, type ILogger, type ILoggerFactory, type ILoggerProvider, type ILoggingBuilder,
  LogLevel } from '@rhombus-std/logging.core';
import { type IOptions, Options } from '@rhombus-std/options';
import { Type } from '@rhombus-std/primitives';
import { augment } from '@rhombus-std/primitives';
import { tokenfor, typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { Logger } from './Logger';
import { LoggerExternalScopeProvider } from './LoggerExternalScopeProvider';
import { LoggerFilterOptions } from './LoggerFilterOptions';
import { LoggerInformation, MessageLogger, ScopeLogger } from './LoggerInformation';
import { LoggerRuleSelector } from './LoggerRuleSelector';
import { NullLogger } from './null-logger';
import { isSupportExternalScope } from './support-external-scope-guard';
import { LOGGER_FACTORY_TOKEN } from './tokens';

/** A provider plus whether the factory owns its disposal. */
interface ProviderRegistration {
  provider: ILoggerProvider;
  shouldDispose: boolean;
}

// `@augment` installs the registry's `createLogger(type)` dispatcher onto this
// factory's prototype at runtime (see logging.core's logger-factory-augmentations.ts) —
// not visible in the static type.
@augment(typefor<ILoggerFactory>())
export class LoggerFactory implements ILoggerFactory {
  readonly #loggers = new Map<string, Logger>();
  readonly #providerRegistrations: ProviderRegistration[] = [];
  #filterOptions!: LoggerFilterOptions;
  #scopeProvider: IExternalScopeProvider | undefined;
  #changeSubscription: Disposable | undefined;
  #disposed = false;

  public constructor(providers: Iterable<ILoggerProvider> = [],
    filterOptions?: LoggerFilterOptions | IOptions<LoggerFilterOptions>, scopeProvider?: IExternalScopeProvider) {
    this.#scopeProvider = scopeProvider;

    const source: IOptions<LoggerFilterOptions> = filterOptions === undefined
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
        // Swallow errors on dispose.
      }
    }
  }

  #throwIfDisposed(): void {
    if (this.#disposed) {
      throw new Error('LoggerFactory has been disposed.');
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
      const { minLevel, filter } = LoggerRuleSelector.select(this.#filterOptions, information.providerType,
        information.category);

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
   * delegate. Spins up a {@link DefaultManifest}, runs `addLogging(configure)`,
   * builds the container, and resolves the factory. The returned
   * {@link ILoggerFactory} owns the container: disposing it disposes the
   * provider (and everything it built, the factory included).
   */
  public static create(configure: Func<[ILoggingBuilder], void>): ILoggerFactory {
    const services = new DefaultManifest().addLogging(configure);
    const provider = services.build();
    const factory = provider.getRequiredService(Type.from(LOGGER_FACTORY_TOKEN));
    return new DisposingLoggerFactory(factory, provider);
  }
}

/** Wraps a container-resolved {@link ILoggerFactory} so disposing the factory disposes the owning container scope. */
@augment(typefor<ILoggerFactory>())
class DisposingLoggerFactory implements ILoggerFactory {
  public constructor(private readonly factory: ILoggerFactory, private readonly provider: ServiceProvider) {}

  public createLogger(categoryName: string): ILogger {
    return this.factory.createLogger(categoryName);
  }

  public addProvider(provider: ILoggerProvider): void {
    this.factory.addProvider(provider);
  }

  public [Symbol.dispose](): void {
    this.provider.dispose();
  }
}
