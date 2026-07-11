// LogEntry — the rendered-entry record a console formatter receives, mirroring
// the reference logging-abstractions `LogEntry<TState>` readonly struct.
//
// RESIDUAL NOTE: the reference declares this type in its ABSTRACTIONS package
// (the @rhombus-std/logging.core analog), not in the console package. It lives
// here only because logging.core does not ship it yet; once logging.core gains
// `LogEntry`, this local declaration should be retired in favor of a re-export.
// The type is structural, so the move is non-breaking for consumers.

import type { EventId, LogLevel } from "@rhombus-std/logging.core";
import type { Func } from "@rhombus-toolkit/func";

/** Holds the information for a single log entry, handed to a {@link ConsoleFormatter}. */
export interface LogEntry<TState> {
  /** The entry's severity. */
  readonly logLevel: LogLevel;

  /** The category (logger name) the entry was written to. */
  readonly category: string;

  /** The id of the event. */
  readonly eventId: EventId;

  /** The deferred state — an arbitrary value rendered by {@link formatter}. */
  readonly state: TState;

  /** The error related to this entry, if any (the reference `Exception`). */
  readonly error: Error | undefined;

  /** Renders `state` (and `error`) into the message string. */
  readonly formatter: Func<[TState, Error | undefined], string>;
}
