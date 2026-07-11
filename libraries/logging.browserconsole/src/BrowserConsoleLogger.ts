// BrowserConsoleLogger — an ILogger writing through the browser console
// global. Plain formatting (no ANSI, no formatter pipeline): the browser
// devtools already style each severity channel, so the logger renders
// `category[eventId] message` and routes it to the LogLevel-mapped console
// method (error/warn/info/debug). An attached Error is passed as a SEPARATE
// console argument so devtools render its stack interactively instead of a
// flattened string.

import { type EventId, type ILogger, type LoggerExtensionMethods, LogLevel } from '@rhombus-std/logging.core';
import { augment } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives.transformer/internal/nameof';
import type { Func } from '@rhombus-toolkit/func';
import type { ConsoleLike } from './console-global';

/** The console method a {@link LogLevel} maps to. */
export type ConsoleMethod = 'error' | 'warn' | 'info' | 'debug';

/**
 * Maps a writable {@link LogLevel} onto its console method: Trace/Debug ->
 * `debug`, Information -> `info`, Warning -> `warn`, Error/Critical ->
 * `error`. {@link LogLevel.None} is not writable (isEnabled gates it out) and
 * throws.
 */
export function consoleMethodFor(logLevel: LogLevel): ConsoleMethod {
  switch (logLevel) {
    case LogLevel.Trace:
    case LogLevel.Debug: {
      return 'debug';
    }
    case LogLevel.Information: {
      return 'info';
    }
    case LogLevel.Warning: {
      return 'warn';
    }
    case LogLevel.Error:
    case LogLevel.Critical: {
      return 'error';
    }
    case LogLevel.None: {
      throw new RangeError('LogLevel.None is not a writable level.');
    }
  }
}

// The class-side type merge for the registry-installed `LoggerExtensions`
// methods (log/logInformation/…). `ILogger` itself gets NO interface merge
// (§36: many implementers); the method form is typed here, exactly where
// `@augment(nameof<ILogger>())` installs it.
export interface BrowserConsoleLogger extends LoggerExtensionMethods {}

/** An {@link ILogger} that writes through the browser console global. */
@augment(nameof<ILogger>())
export class BrowserConsoleLogger implements ILogger {
  readonly #name: string;
  readonly #console: ConsoleLike;

  public constructor(name: string, console: ConsoleLike) {
    this.#name = name;
    this.#console = console;
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

    const message = `${this.#name}[${eventId.id}] ${formatter(state, error)}`;
    const method = consoleMethodFor(logLevel);
    if (error !== undefined) {
      this.#console[method](message, error);
    } else {
      this.#console[method](message);
    }
  }

  /** Everything below {@link LogLevel.None} is writable; category filtering happens upstream. */
  public isEnabled(logLevel: LogLevel): boolean {
    return logLevel !== LogLevel.None;
  }

  /** Scopes are unsupported — plain formatting has nowhere to render them. */
  public beginScope<TState>(_state: TState): Disposable | undefined {
    return undefined;
  }
}
