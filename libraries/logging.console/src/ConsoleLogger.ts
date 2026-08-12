// ConsoleLogger renders each entry through its current ConsoleFormatter into
// a shared StringWriter, then hands the rendered string to the
// ConsoleLoggerProcessor queue (routed to stderr at/above the options'
// logToStandardErrorThreshold).

import { type EventId, type ILogger, LogLevel } from '@rhombus-std/logging.core';
import type { IExternalScopeProvider, LogEntry } from '@rhombus-std/logging.core';
import { augment } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import type { ConsoleFormatter } from './ConsoleFormatter';
import type { ConsoleLoggerOptions } from './ConsoleLoggerOptions';
import type { ConsoleLoggerProcessor } from './ConsoleLoggerProcessor';
import { StringWriter } from './text-writer';

// Single-threaded runtime, so one shared module-level writer suffices.
const sharedStringWriter = new StringWriter();

// Declaration-merged with ILogger so its wrapper methods (logInformation,
// etc.) are available on ConsoleLogger alongside the
// `@augment(typefor<ILogger>())` install below.
export interface ConsoleLogger extends ILogger {}

/** An {@link ILogger} that renders through a {@link ConsoleFormatter} and queues writes. */
@augment(typefor<ILogger>())
export class ConsoleLogger implements ILogger {
  readonly #name: string;
  readonly #queueProcessor: ConsoleLoggerProcessor;

  /** The formatter rendering this logger's entries; reassigned when options reload. */
  public formatter: ConsoleFormatter;

  /** The scope provider, or `undefined` when scopes are unsupported. */
  public scopeProvider: IExternalScopeProvider | undefined;

  /** The current options; reassigned when options reload. */
  public options: ConsoleLoggerOptions;

  public constructor(name: string, loggerProcessor: ConsoleLoggerProcessor, formatter: ConsoleFormatter,
    scopeProvider: IExternalScopeProvider | undefined, options: ConsoleLoggerOptions) {
    this.#name = name;
    this.#queueProcessor = loggerProcessor;
    this.formatter = formatter;
    this.scopeProvider = scopeProvider;
    this.options = options;
  }

  public log<TState>(logLevel: LogLevel, eventId: EventId, state: TState, error: Error | undefined,
    formatter: Func<[TState, Error | undefined], string>): void {
    if (!this.isEnabled(logLevel)) {
      return;
    }

    const logEntry: LogEntry<TState> = { logLevel, category: this.#name, eventId, state, error, formatter };
    this.formatter.write(logEntry, this.scopeProvider, sharedStringWriter);

    if (sharedStringWriter.length === 0) {
      return;
    }
    const computedAnsiString = sharedStringWriter.toString();
    sharedStringWriter.clear();
    this.#queueProcessor.enqueueMessage({ message: computedAnsiString,
      logAsError: logLevel >= this.options.logToStandardErrorThreshold });
  }

  /** Every level is enabled except {@link LogLevel.None}; filtering belongs to the factory. */
  public isEnabled(logLevel: LogLevel): boolean {
    return logLevel !== LogLevel.None;
  }

  /**
   * Begins a scope through the configured scope provider; `undefined` when no
   * scope provider was supplied.
   */
  public beginScope<TState>(state: TState): Disposable | undefined {
    return this.scopeProvider?.push(state);
  }
}
