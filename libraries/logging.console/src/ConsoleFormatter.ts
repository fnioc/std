// ConsoleFormatter — the pluggable log-message formatter abstraction, ported
// from the reference console-logging package's `ConsoleFormatter`.

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
   * If the formatter wants to write colors to the console, it can do so by
   * embedding ANSI color codes into the string.
   *
   * @param logEntry The log entry.
   * @param scopeProvider The provider of scope data, or `undefined`.
   * @param textWriter The writer embedding ANSI codes for colors.
   */
  public abstract write<TState>(
    logEntry: LogEntry<TState>,
    scopeProvider: IExternalScopeProvider | undefined,
    textWriter: TextWriter,
  ): void;
}
