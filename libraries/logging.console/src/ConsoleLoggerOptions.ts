import { LogLevel } from '@rhombus-std/logging.core';
import { ConsoleLoggerQueueFullMode } from './ConsoleLoggerQueueFullMode';

/** The default {@link ConsoleLoggerOptions.maxQueueLength}. */
export const DEFAULT_MAX_QUEUE_LENGTH = 2500;

/** Options for a console logger. */
export class ConsoleLoggerOptions {
  /**
   * The name of the log message formatter to use. An unset or unrecognized
   * name resolves to `"simple"`.
   */
  public formatterName: string | undefined = undefined;

  /**
   * The minimum level of messages that get written to the standard error
   * stream instead of standard out. Defaults to {@link LogLevel.None}
   * (everything goes to standard out).
   */
  public logToStandardErrorThreshold: LogLevel = LogLevel.None;

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
