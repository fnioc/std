// ConsoleLoggerProvider — a provider of ConsoleLogger instances, ported from
// the reference `ConsoleLoggerProvider`: owns the options monitor, the
// formatter registry (built-ins seeded when none are supplied), and the
// background queue processor it flushes on dispose.
//
// Adaptations, each argued at its site:
//   - `IOptionsMonitor<ConsoleLoggerOptions>` → the repo's collapsed
//     `IOptions<ConsoleLoggerOptions>`, and OPTIONAL: a bare
//     `new ConsoleLoggerProvider()` (hosting's default services) gets default
//     options — the reference reaches the same defaults through DI.
//   - The reference picks an ANSI-passthrough vs ANSI-parsing console by
//     probing the platform (`DoesConsoleSupportAnsi`). On this platform ANSI
//     IS the console color mechanism, so the passthrough `AnsiLogConsole` is
//     always used and the probe (a legacy-console concern) is not ported.
//   - `ISupportExternalScope` doesn't exist in @rhombus-std/logging.core yet
//     (residual); its `setScopeProvider` member is ported directly. The
//     `NullExternalScopeProvider` default collapses to `undefined` (the
//     loggers and formatters accept an absent scope provider).

import type { ILogger, ILoggerProvider } from '@rhombus-std/logging.core';
import type { IExternalScopeProvider } from '@rhombus-std/logging.core';
import { type IOptions, Options } from '@rhombus-std/options';
import { AnsiLogConsole } from './AnsiLogConsole';
import { ConsoleFormatter } from './ConsoleFormatter';
import { ConsoleFormatterNames } from './ConsoleFormatterNames';
import { ConsoleFormatterOptions } from './ConsoleFormatterOptions';
import { ConsoleLogger } from './ConsoleLogger';
import { ConsoleLoggerFormat } from './ConsoleLoggerFormat';
import { ConsoleLoggerOptions } from './ConsoleLoggerOptions';
import { ConsoleLoggerProcessor } from './ConsoleLoggerProcessor';
import { JsonConsoleFormatter } from './JsonConsoleFormatter';
import { JsonConsoleFormatterOptions } from './JsonConsoleFormatterOptions';
import { LoggerColorBehavior } from './LoggerColorBehavior';
import { SimpleConsoleFormatter } from './SimpleConsoleFormatter';
import { SimpleConsoleFormatterOptions } from './SimpleConsoleFormatterOptions';
import { SystemdConsoleFormatter } from './SystemdConsoleFormatter';

/** The reference formatter registry is name-keyed case-insensitively. */
function normalizeName(name: string): string {
  return name.toLowerCase();
}

/** An {@link ILoggerProvider} that creates {@link ConsoleLogger}s. */
export class ConsoleLoggerProvider implements ILoggerProvider {
  readonly #options: IOptions<ConsoleLoggerOptions>;
  readonly #loggers = new Map<string, ConsoleLogger>();
  readonly #formatters = new Map<string, ConsoleFormatter>();
  readonly #messageQueue: ConsoleLoggerProcessor;
  readonly #optionsReloadToken: Disposable | undefined;
  #scopeProvider: IExternalScopeProvider | undefined = undefined;

  /**
   * @param options The options to create {@link ConsoleLogger} instances
   * with; defaults to a static default `ConsoleLoggerOptions`.
   * @param formatters Log formatters added for {@link ConsoleLogger}
   * instances; when none are supplied the three built-ins (simple, systemd,
   * json) are seeded with default options.
   */
  public constructor(
    options?: IOptions<ConsoleLoggerOptions>,
    formatters?: Iterable<ConsoleFormatter>,
  ) {
    this.#options = options ?? Options.of(new ConsoleLoggerOptions());
    this.#setFormatters(formatters);

    const current = this.#options.value;
    this.#messageQueue = new ConsoleLoggerProcessor(
      new AnsiLogConsole(),
      new AnsiLogConsole(true),
      current.queueFullMode,
      current.maxQueueLength,
    );

    this.#reloadLoggerOptions(current);
    this.#optionsReloadToken = this.#options.subscribe?.((reloaded) => {
      this.#reloadLoggerOptions(reloaded);
    });
  }

  #setFormatters(formatters: Iterable<ConsoleFormatter> | undefined): void {
    let added = false;
    if (formatters !== undefined) {
      for (const formatter of formatters) {
        this.addFormatter(formatter);
        added = true;
      }
    }
    if (!added) {
      this.addFormatter(new SimpleConsoleFormatter(Options.of(new SimpleConsoleFormatterOptions())));
      this.addFormatter(new SystemdConsoleFormatter(Options.of(new ConsoleFormatterOptions())));
      this.addFormatter(new JsonConsoleFormatter(Options.of(new JsonConsoleFormatterOptions())));
    }
  }

  /**
   * Adds `formatter` to the registry unless its name is already taken (the
   * reference `TryAdd` — first registration of a name wins). Internal seam:
   * the console registration uses it to deliver a formatter registered after
   * the provider was constructed, which the reference's DI laziness gets for
   * free.
   */
  public addFormatter(formatter: ConsoleFormatter): void {
    const key = normalizeName(formatter.name);
    if (!this.#formatters.has(key)) {
      this.#formatters.set(key, formatter);
    }
  }

  #resolveFormatter(options: ConsoleLoggerOptions): ConsoleFormatter {
    let formatter = options.formatterName !== undefined
      ? this.#formatters.get(normalizeName(options.formatterName))
      : undefined;
    if (formatter === undefined) {
      // Deprecated-path fallback, kept for parity with the reference:
      // no/unknown formatterName resolves through the obsolete `format`.

      formatter = options.format === ConsoleLoggerFormat.Systemd
        ? this.#formatters.get(ConsoleFormatterNames.systemd)!
        : this.#formatters.get(ConsoleFormatterNames.simple)!;
      if (options.formatterName === undefined) {
        ConsoleLoggerProvider.#updateFormatterOptions(formatter, options);
      }
    }
    return formatter;
  }

  // warning: reachable before the constructor completed (first call happens
  // inside it) — everything it touches is initialized beforehand.
  #reloadLoggerOptions(options: ConsoleLoggerOptions): void {
    const logFormatter = this.#resolveFormatter(options);

    this.#messageQueue.fullMode = options.queueFullMode;
    this.#messageQueue.maxQueueLength = options.maxQueueLength;

    for (const logger of this.#loggers.values()) {
      logger.options = options;
      logger.formatter = logFormatter;
    }
  }

  /** Creates (or returns the cached) {@link ConsoleLogger} for `name`. */
  public createLogger(name: string): ILogger {
    const current = this.#options.value;
    const logFormatter = this.#resolveFormatter(current);

    let logger = this.#loggers.get(name);
    if (logger === undefined) {
      logger = new ConsoleLogger(name, this.#messageQueue, logFormatter, this.#scopeProvider, current);
      this.#loggers.set(name, logger);
    }
    return logger;
  }

  /** Maps the deprecated flat options onto the built-in formatters — kept for the deprecated APIs. */
  static #updateFormatterOptions(formatter: ConsoleFormatter, deprecatedFromOptions: ConsoleLoggerOptions): void {
    if (formatter instanceof SimpleConsoleFormatter) {
      const formatterOptions = new SimpleConsoleFormatterOptions();
      formatterOptions.colorBehavior = deprecatedFromOptions.disableColors
        ? LoggerColorBehavior.Disabled
        : LoggerColorBehavior.Default;
      formatterOptions.includeScopes = deprecatedFromOptions.includeScopes;
      formatterOptions.timestampFormat = deprecatedFromOptions.timestampFormat;
      formatterOptions.useUtcTimestamp = deprecatedFromOptions.useUtcTimestamp;
      formatter.formatterOptions = formatterOptions;
    } else if (formatter instanceof SystemdConsoleFormatter) {
      const formatterOptions = new ConsoleFormatterOptions();
      formatterOptions.includeScopes = deprecatedFromOptions.includeScopes;
      formatterOptions.timestampFormat = deprecatedFromOptions.timestampFormat;
      formatterOptions.useUtcTimestamp = deprecatedFromOptions.useUtcTimestamp;
      formatter.formatterOptions = formatterOptions;
    }
  }

  /** Sets the scope provider all current and future loggers use — the `ISupportExternalScope` member. */
  public setScopeProvider(scopeProvider: IExternalScopeProvider): void {
    this.#scopeProvider = scopeProvider;
    for (const logger of this.#loggers.values()) {
      logger.scopeProvider = scopeProvider;
    }
  }

  /** Stops watching options and flushes the queue. */
  public [Symbol.dispose](): void {
    this.#optionsReloadToken?.[Symbol.dispose]();
    this.#messageQueue[Symbol.dispose]();
  }
}
