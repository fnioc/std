// ConsoleLoggerOptions — options for a ConsoleLogger, ported from the
// reference `ConsoleLoggerOptions` (including its deprecated members, whose
// upstream `[Obsolete]` markers are preserved as `@deprecated`).

import { LogLevel } from '@rhombus-std/logging.core';
import { ConsoleLoggerFormat } from './ConsoleLoggerFormat';
import { ConsoleLoggerQueueFullMode } from './ConsoleLoggerQueueFullMode';

/** The default {@link ConsoleLoggerOptions.maxQueueLength}. */
export const DEFAULT_MAX_QUEUE_LENGTH = 2500;

/** Options for a console logger. */
export class ConsoleLoggerOptions {
  /**
   * Whether colors are disabled.
   *
   * @deprecated `ConsoleLoggerOptions.disableColors` has been deprecated — use
   * {@link SimpleConsoleFormatterOptions.colorBehavior} instead.
   */
  public disableColors = false;

  #format: ConsoleLoggerFormat = ConsoleLoggerFormat.Default;

  /**
   * The log message format.
   *
   * @deprecated `ConsoleLoggerOptions.format` has been deprecated — use
   * {@link ConsoleLoggerOptions.formatterName} instead.
   */
  public get format(): ConsoleLoggerFormat {
    return this.#format;
  }

  public set format(value: ConsoleLoggerFormat) {
    if (value !== ConsoleLoggerFormat.Default && value !== ConsoleLoggerFormat.Systemd) {
      throw new RangeError(`Invalid ConsoleLoggerFormat: ${value}.`);
    }
    this.#format = value;
  }

  /**
   * The name of the log message formatter to use. `undefined` (the default)
   * resolves through the deprecated {@link format} switch to `"simple"`.
   */
  public formatterName: string | undefined = undefined;

  /**
   * Whether scopes are included.
   *
   * @deprecated `ConsoleLoggerOptions.includeScopes` has been deprecated — use
   * {@link ConsoleFormatterOptions.includeScopes} instead.
   */
  public includeScopes = false;

  /**
   * The minimum level of messages that get written to the standard error
   * stream instead of standard out. Defaults to {@link LogLevel.None}
   * (everything goes to standard out).
   */
  public logToStandardErrorThreshold: LogLevel = LogLevel.None;

  /**
   * The format string used to format timestamps in logging messages.
   *
   * @deprecated `ConsoleLoggerOptions.timestampFormat` has been deprecated —
   * use {@link ConsoleFormatterOptions.timestampFormat} instead.
   */
  public timestampFormat: string | undefined = undefined;

  /**
   * Whether the UTC timezone should be used to format timestamps.
   *
   * @deprecated `ConsoleLoggerOptions.useUtcTimestamp` has been deprecated —
   * use {@link ConsoleFormatterOptions.useUtcTimestamp} instead.
   */
  public useUtcTimestamp = false;

  #queueFullMode: ConsoleLoggerQueueFullMode = ConsoleLoggerQueueFullMode.Wait;

  /**
   * The desired console logger behavior when the queue becomes full. Defaults
   * to {@link ConsoleLoggerQueueFullMode.Wait}.
   */
  public get queueFullMode(): ConsoleLoggerQueueFullMode {
    return this.#queueFullMode;
  }

  public set queueFullMode(value: ConsoleLoggerQueueFullMode) {
    if (value !== ConsoleLoggerQueueFullMode.Wait && value !== ConsoleLoggerQueueFullMode.DropWrite) {
      throw new RangeError(`${value} is not a supported queue mode value.`);
    }
    this.#queueFullMode = value;
  }

  #maxQueuedMessages = DEFAULT_MAX_QUEUE_LENGTH;

  /** The maximum number of enqueued messages. Defaults to 2500. */
  public get maxQueueLength(): number {
    return this.#maxQueuedMessages;
  }

  public set maxQueueLength(value: number) {
    if (value <= 0) {
      throw new RangeError(`maxQueueLength must be larger than zero, was ${value}.`);
    }
    this.#maxQueuedMessages = value;
  }
}
