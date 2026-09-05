// LogEntry bundles the arguments of a provider's `ILogger.log` call, so a
// provider-side sink (a console formatter, a buffered writer) can pass one value
// around instead of six.

import type { Func } from '@rhombus-toolkit/types';
import type { EventId } from './EventId';
import type { ILogger } from './ILogger';
import type { LogLevel } from './LogLevel';

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

  /** The error related to this entry, if any. */
  readonly error: Error | undefined;

  /** Renders `state` (and `error`) into the message string. */
  readonly formatter: Func<[TState, Error | undefined], string>;
}
