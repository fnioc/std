// The cached log-delegate factories: define / defineScope.

import { EventId, type EventIdLike } from './EventId';
import { formatLogValues, FormattedLogValues } from './formatted-log-values';
import type { ILogger } from './ILogger';
import type { LogLevel } from './LogLevel';

/** Options for {@link LoggerMessage.define} and its overloads. */
export interface LogDefineOptions {
  /** Skips the `isEnabled` check inside the returned log action. Defaults to `false`. */
  skipEnabledCheck?: boolean;
}

function define(logLevel: LogLevel, eventId: EventIdLike, formatString: string, options?: LogDefineOptions): (logger: ILogger, error: Error | undefined) => void;
function define<T1>(logLevel: LogLevel, eventId: EventIdLike, formatString: string, options?: LogDefineOptions): (logger: ILogger, arg1: T1, error: Error | undefined) => void;
function define<T1, T2>(logLevel: LogLevel, eventId: EventIdLike, formatString: string, options?: LogDefineOptions): (logger: ILogger, arg1: T1, arg2: T2, error: Error | undefined) => void;
function define<T1, T2, T3>(logLevel: LogLevel, eventId: EventIdLike, formatString: string,
  options?: LogDefineOptions): (logger: ILogger, arg1: T1, arg2: T2, arg3: T3, error: Error | undefined) => void;
function define<T1, T2, T3, T4>(logLevel: LogLevel, eventId: EventIdLike, formatString: string,
  options?: LogDefineOptions): (logger: ILogger, arg1: T1, arg2: T2, arg3: T3, arg4: T4, error: Error | undefined) => void;
function define<T1, T2, T3, T4, T5>(logLevel: LogLevel, eventId: EventIdLike, formatString: string,
  options?: LogDefineOptions): (logger: ILogger, arg1: T1, arg2: T2, arg3: T3, arg4: T4, arg5: T5, error: Error | undefined) => void;
function define<T1, T2, T3, T4, T5, T6>(logLevel: LogLevel, eventId: EventIdLike, formatString: string,
  options?: LogDefineOptions): (logger: ILogger, arg1: T1, arg2: T2, arg3: T3, arg4: T4, arg5: T5, arg6: T6, error: Error | undefined) => void;
function define(logLevel: LogLevel, eventId: EventIdLike, formatString: string, options?: LogDefineOptions): (logger: ILogger, ...rest: unknown[]) => void {
  const id = EventId.from(eventId);
  const skipEnabledCheck = options?.skipEnabledCheck === true;
  return (logger: ILogger, ...rest: unknown[]): void => {
    // The typed overloads guarantee the trailing arg is the error; everything
    // before it is a template value.
    const error = rest[rest.length - 1] as Error | undefined;
    const args = rest.slice(0, rest.length - 1);
    if (skipEnabledCheck || logger.isEnabled(logLevel)) {
      logger.log(logLevel, id, new FormattedLogValues(formatString, args), error, formatLogValues);
    }
  };
}

function defineScope(formatString: string): (logger: ILogger) => Disposable | undefined;
function defineScope<T1>(formatString: string): (logger: ILogger, arg1: T1) => Disposable | undefined;
function defineScope<T1, T2>(formatString: string): (logger: ILogger, arg1: T1, arg2: T2) => Disposable | undefined;
function defineScope<T1, T2, T3>(
  formatString: string,
): (logger: ILogger, arg1: T1, arg2: T2, arg3: T3) => Disposable | undefined;
function defineScope<T1, T2, T3, T4>(
  formatString: string,
): (logger: ILogger, arg1: T1, arg2: T2, arg3: T3, arg4: T4) => Disposable | undefined;
function defineScope<T1, T2, T3, T4, T5>(
  formatString: string,
): (logger: ILogger, arg1: T1, arg2: T2, arg3: T3, arg4: T4, arg5: T5) => Disposable | undefined;
function defineScope<T1, T2, T3, T4, T5, T6>(
  formatString: string,
): (logger: ILogger, arg1: T1, arg2: T2, arg3: T3, arg4: T4, arg5: T5, arg6: T6) => Disposable | undefined;
function defineScope(formatString: string): (logger: ILogger, ...args: unknown[]) => Disposable | undefined {
  return (logger: ILogger, ...args: unknown[]): Disposable | undefined => {
    return logger.beginScope(new FormattedLogValues(formatString, args));
  };
}

/**
 * Creates cached delegates that log messages and open scopes.
 * `define(logLevel, eventId, formatString)` binds a log action to a fixed
 * level/event/template; `defineScope(formatString)` opens a scope. Create the
 * delegate once and reuse it per message, so the template is parsed a single time.
 */
export const LoggerMessage = { define, defineScope };
