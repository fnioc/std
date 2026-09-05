import type { ILogger, ILoggerProvider } from '@rhombus-std/logging.core';
import type { IExternalScopeProvider } from '@rhombus-std/logging.core';
import { type IOptions, Options } from '@rhombus-std/options';
import { AnsiLogConsole } from './AnsiLogConsole';
import { ConsoleFormatter } from './ConsoleFormatter';
import { ConsoleFormatterNames } from './ConsoleFormatterNames';
import { ConsoleFormatterOptions } from './ConsoleFormatterOptions';
import { ConsoleLogger } from './ConsoleLogger';
import { ConsoleLoggerOptions } from './ConsoleLoggerOptions';
import { ConsoleLoggerProcessor } from './ConsoleLoggerProcessor';
import { JsonConsoleFormatter } from './JsonConsoleFormatter';
import { JsonConsoleFormatterOptions } from './JsonConsoleFormatterOptions';
import { SimpleConsoleFormatter } from './SimpleConsoleFormatter';
import { SimpleConsoleFormatterOptions } from './SimpleConsoleFormatterOptions';
import { SystemdConsoleFormatter } from './SystemdConsoleFormatter';

/** The formatter registry is name-keyed case-insensitively. */
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
  public constructor(options?: IOptions<ConsoleLoggerOptions>, formatters?: Iterable<ConsoleFormatter>) {
    this.#options = options ?? Options.of(new ConsoleLoggerOptions());
    this.#setFormatters(formatters);

    const current = this.#options.value;
    this.#messageQueue = new ConsoleLoggerProcessor(new AnsiLogConsole(), new AnsiLogConsole(true), current.queueFullMode, current.maxQueueLength);

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
   * Adds `formatter` to the registry unless its name is already taken — first
   * registration of a name wins. Lets a formatter be registered after the
   * provider itself was constructed.
   */
  public addFormatter(formatter: ConsoleFormatter): void {
    const key = normalizeName(formatter.name);
    if (!this.#formatters.has(key)) {
      this.#formatters.set(key, formatter);
    }
  }

  #resolveFormatter(options: ConsoleLoggerOptions): ConsoleFormatter {
    const named = options.formatterName !== undefined
      ? this.#formatters.get(normalizeName(options.formatterName))
      : undefined;
    return named ?? this.#formatters.get(ConsoleFormatterNames.simple)!;
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

    return this.#loggers.getOrInsertComputed(name, (name) => new ConsoleLogger(name, this.#messageQueue, logFormatter, this.#scopeProvider, current));
  }

  /** Sets the scope provider all current and future loggers use. */
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
