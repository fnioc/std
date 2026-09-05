import type { IExternalScopeProvider, LogEntry } from '@rhombus-std/logging.core';
import type { TextWriter } from './text-writer';

/** Allows custom log message formatting. */
export abstract class ConsoleFormatter {
  /** The name associated with the console log formatter. */
  public readonly name: string;

  protected constructor(name: string) {
    this.name = name;
  }

  /**
   * Writes the log message to the specified {@link TextWriter}.
   *
   * @remarks
   * To write colors to the console, embed ANSI color codes directly into the written string.
   */
  public abstract write<TState>(logEntry: LogEntry<TState>, scopeProvider: IExternalScopeProvider | undefined, textWriter: TextWriter): void;
}
