// ILogger and the scope-provider contract, ported from
// ME.Logging.Abstractions' `ILogger` / `IExternalScopeProvider`.

import type { Func } from "@rhombus-toolkit/func";
import type { EventId } from "./event-id";
import type { LogLevel } from "./LogLevel";

/**
 * Represents a type used to perform logging.
 *
 * The single primitive is {@link ILogger.log}: it receives a deferred `state`
 * plus a `formatter` that renders it, so a disabled sink never pays formatting
 * cost. The convenience wrappers (`logInformation`, `logError`, …) in
 * `./logger-augmentations` build the state/formatter for you.
 *
 * `beginScope` returns a `Disposable` (the repo standardizes on
 * `ESNext.Disposable`'s `Symbol.dispose` — see @rhombus-std/options) that ends
 * the scope on dispose, or `undefined` when the logger does not support scopes.
 *
 * The optional `TCategoryName` type parameter is the port of the reference's
 * separate `ILogger<out TCategoryName>` interface: TS forbids two same-named
 * interfaces of differing arity, so the two collapse into one interface whose
 * bare form (`ILogger` = `ILogger<unknown>`) is the reference's `ILogger` and
 * whose `ILogger<T>` form is the generic-category logger injected from DI. The
 * parameter is a PHANTOM marker — the platform erases it, so the concrete
 * category comes from the type's di token at registration (see
 * `@rhombus-std/logging`'s `Logger`), not from `T`.
 */
export interface ILogger<TCategoryName = unknown> {
  /**
   * Writes a log entry.
   *
   * @param logLevel The severity at which to write the event.
   * @param eventId The id of the event.
   * @param state The entry to write — an arbitrary value rendered by `formatter`.
   * @param error The error related to this entry, if any.
   * @param formatter Renders `state` (and `error`) into the message string.
   */
  log<TState>(
    logLevel: LogLevel,
    eventId: EventId,
    state: TState,
    error: Error | undefined,
    formatter: Func<[TState, Error | undefined], string>,
  ): void;

  /** Checks whether the given `logLevel` is enabled. */
  isEnabled(logLevel: LogLevel): boolean;

  /**
   * Begins a logical operation scope. Returns a `Disposable` that ends the
   * scope on dispose, or `undefined` when scopes are unsupported.
   */
  beginScope<TState>(state: TState): Disposable | undefined;
}

/**
 * A store of common scope data, ported from `IExternalScopeProvider`. A
 * provider-side sink uses this to enumerate the ambient scopes active when a
 * message is written.
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
