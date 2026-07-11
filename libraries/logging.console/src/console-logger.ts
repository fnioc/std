// ConsoleLogger — the console provider's logger, ported from the reference
// internal `ConsoleLogger`: renders each entry through its current
// ConsoleFormatter into a shared StringWriter, then hands the rendered string
// to the ConsoleLoggerProcessor queue (routed to stderr at/above the options'
// logToStandardErrorThreshold).
//
// The reference's `IBufferedLogger` side (`LogRecords`/`BufferedLogRecord`) is
// NOT ported — those types don't exist in @rhombus-std/logging.core yet
// (residual, see the package index).

import { type EventId, type ILogger, type LoggerExtensionMethods, LogLevel } from "@rhombus-std/logging.core";
import type { IExternalScopeProvider, LogEntry } from "@rhombus-std/logging.core";
import { augment } from "@rhombus-std/primitives";
import { nameof } from "@rhombus-std/primitives.transformer/internal/nameof";
import type { Func } from "@rhombus-toolkit/func";
import type { ConsoleFormatter } from "./ConsoleFormatter";
import type { ConsoleLoggerOptions } from "./ConsoleLoggerOptions";
import type { ConsoleLoggerProcessor } from "./ConsoleLoggerProcessor";
import { StringWriter } from "./text-writer";

// The reference renders through a [ThreadStatic] StringWriter; single-threaded
// runtime → one shared module-level writer.
const sharedStringWriter = new StringWriter();

// The class-side type merge for the registry-installed `LoggerExtensions`
// methods (log/logInformation/…). `ILogger` itself gets NO interface merge
// (§36: many implementers); the method form is typed here, exactly where
// `@augment(nameof<ILogger>())` installs it — see @rhombus-std/logging's Logger.
export interface ConsoleLogger extends LoggerExtensionMethods {}

/** An {@link ILogger} that renders through a {@link ConsoleFormatter} and queues writes. */
@augment(nameof<ILogger>())
export class ConsoleLogger implements ILogger {
  readonly #name: string;
  readonly #queueProcessor: ConsoleLoggerProcessor;

  /** The formatter rendering this logger's entries (internal, as upstream: reassigned on options reload). */
  public formatter: ConsoleFormatter;

  /** The scope provider, or `undefined` when scopes are unsupported (internal, as upstream). */
  public scopeProvider: IExternalScopeProvider | undefined;

  /** The current options (internal, as upstream: reassigned on options reload). */
  public options: ConsoleLoggerOptions;

  public constructor(
    name: string,
    loggerProcessor: ConsoleLoggerProcessor,
    formatter: ConsoleFormatter,
    scopeProvider: IExternalScopeProvider | undefined,
    options: ConsoleLoggerOptions,
  ) {
    this.#name = name;
    this.#queueProcessor = loggerProcessor;
    this.formatter = formatter;
    this.scopeProvider = scopeProvider;
    this.options = options;
  }

  public log<TState>(
    logLevel: LogLevel,
    eventId: EventId,
    state: TState,
    error: Error | undefined,
    formatter: Func<[TState, Error | undefined], string>,
  ): void {
    if (!this.isEnabled(logLevel)) {
      return;
    }

    const logEntry: LogEntry<TState> = {
      logLevel,
      category: this.#name,
      eventId,
      state,
      error,
      formatter,
    };
    this.formatter.write(logEntry, this.scopeProvider, sharedStringWriter);

    if (sharedStringWriter.length === 0) {
      return;
    }
    const computedAnsiString = sharedStringWriter.toString();
    sharedStringWriter.clear();
    this.#queueProcessor.enqueueMessage({
      message: computedAnsiString,
      logAsError: logLevel >= this.options.logToStandardErrorThreshold,
    });
  }

  /** Every level is enabled except {@link LogLevel.None}; filtering belongs to the factory. */
  public isEnabled(logLevel: LogLevel): boolean {
    return logLevel !== LogLevel.None;
  }

  /**
   * Begins a scope through the provider's scope provider; `undefined` when no
   * scope provider was supplied (the analog of the reference `NullScope`).
   */
  public beginScope<TState>(state: TState): Disposable | undefined {
    return this.scopeProvider?.push(state);
  }
}
