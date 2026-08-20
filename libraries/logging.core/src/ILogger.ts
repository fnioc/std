// ILogger and the scope-provider contract.

import type { Func } from '@rhombus-toolkit/func';
import type { EventId } from './EventId';
import type { LogLevel } from './LogLevel';

/**
 * Represents a type used to perform logging.
 *
 * @remarks
 * The single primitive is {@link ILogger.log}: it takes a deferred `state` plus
 * a `formatter` that renders it, so a disabled sink never pays formatting cost.
 * The convenience wrappers (`logInformation`, `logError`, …) build the
 * `state`/`formatter` for you.
 *
 * @typeParam TCategoryName - A phantom marker only; the platform erases it, so a
 * generic-category logger's category comes from the closing type at registration
 * (see {@link Logger} in `@rhombus-std/logging`), not from this type parameter. The
 * bare `ILogger` is `ILogger<unknown>`.
 */
export interface ILogger<TCategoryName = unknown> {
  /**
   * Writes a log entry.
   *
   * @param state - An arbitrary value rendered by `formatter`; a structured sink
   * may read it instead of rendering.
   * @param formatter - Renders `state` (and `error`) into the message string.
   */
  log<TState>(logLevel: LogLevel, eventId: EventId, state: TState, error: Error | undefined,
    formatter: Func<[TState, Error | undefined], string>): void;

  isEnabled(logLevel: LogLevel): boolean;

  /**
   * Begins a logical operation scope. Returns a `Disposable` that ends the
   * scope on dispose, or `undefined` when scopes are unsupported.
   */
  beginScope<TState>(state: TState): Disposable | undefined;
}

/**
 * A store of common scope data. A provider-side sink uses it to enumerate the
 * ambient scopes active when a message is written.
 */
export interface IExternalScopeProvider {
  /**
   * Executes `callback` for each currently active scope object, in creation
   * order. All callbacks run inline before this method returns.
   */
  forEachScope<TState>(callback: Func<[unknown, TState], void>, state: TState): void;

  /** Adds a scope object; the returned `Disposable` removes it on dispose. */
  push(state: unknown): Disposable;
}
