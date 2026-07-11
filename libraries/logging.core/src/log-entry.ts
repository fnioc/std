// LogEntry — the information for a single log entry, ported from
// ME.Logging.Abstractions' `LogEntry<TState>` readonly struct.
//
// The reference struct bundles exactly the arguments a provider's `ILogger.log`
// receives, so a provider-side sink (a console formatter, a buffered writer) can
// pass one value around instead of six. It is structural, so the concrete
// classes that build entries do so via object literals; a class analog would add
// no value over the interface. Adapted like the rest of the logging surface:
// the reference `Exception? exception` becomes `error: Error | undefined`.

import type { Func } from "@rhombus-toolkit/func";
import type { EventId } from "./event-id";
import type { ILogger } from "./logger";
import type { LogLevel } from "./LogLevel";

/** Holds the information for a single log entry — the deconstructed {@link ILogger.log} call. */
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
