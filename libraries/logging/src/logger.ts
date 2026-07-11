// Logger — the composite ILogger that fans a write out across the sinks of
// every registered provider, ported from ME.Logging's internal `Logger`.
//
// The composite holds a `LoggerInformation[]` (one per provider, computed by the
// factory) plus the FILTERED views the factory recomputes whenever the filter
// options change: `messageLoggers` (the sinks enabled for this category, each
// with its selected min level + filter delegate) and `scopeLoggers` (the scope
// targets). `log`/`isEnabled` consult `messageLoggers` so `LoggerFilterOptions`
// rules are honoured per (provider, category); `beginScope` fans out across
// `scopeLoggers`. A throwing sink is collected and re-thrown as an
// `AggregateError` after the others run (the reference `AggregateException`).

import type { EventId, ILogger, LoggerExtensionMethods, LogLevel } from "@rhombus-std/logging.core";
import { augment } from "@rhombus-std/primitives";
import { nameof } from "@rhombus-std/primitives.transformer/internal/nameof";
import type { Func } from "@rhombus-toolkit/func";
import type { LoggerInformation, MessageLogger, ScopeLogger } from "./logger-information";

/** A `Disposable` that does nothing on dispose — the shared no-op scope token. */
const NULL_SCOPE: Disposable = { [Symbol.dispose]() {} };

// The class-side type merge for the registry-installed `LoggerExtensions`
// methods (log/logInformation/…). `ILogger` itself gets NO interface merge
// (§36: many implementers); the method form is typed here, exactly where
// `@augment(nameof<ILogger>())` installs it.
export interface Logger extends LoggerExtensionMethods {}

@augment(nameof<ILogger>())
export class Logger implements ILogger {
  /** The provider-participation records — resized in place by the factory on `addProvider`. */
  public loggers: LoggerInformation[];
  /** The filter-selected sinks for this category — set by the factory's `applyFilters`. */
  public messageLoggers: MessageLogger[] | undefined;
  /** The scope targets for this category — set by the factory's `applyFilters`. */
  public scopeLoggers: ScopeLogger[] | undefined;

  public constructor(public readonly categoryName: string, loggers: LoggerInformation[]) {
    this.loggers = loggers;
  }

  public log<TState>(
    logLevel: LogLevel,
    eventId: EventId,
    state: TState,
    error: Error | undefined,
    formatter: Func<[TState, Error | undefined], string>,
  ): void {
    const loggers = this.messageLoggers;
    if (loggers === undefined) {
      return;
    }

    let errors: unknown[] | undefined;
    for (const loggerInfo of loggers) {
      if (!loggerInfo.isEnabled(logLevel)) {
        continue;
      }
      try {
        loggerInfo.logger.log(logLevel, eventId, state, error, formatter);
      } catch (ex) {
        (errors ??= []).push(ex);
      }
    }

    if (errors !== undefined && errors.length) {
      throwLoggingError(errors);
    }
  }

  public isEnabled(logLevel: LogLevel): boolean {
    const loggers = this.messageLoggers;
    if (loggers === undefined) {
      return false;
    }

    let errors: unknown[] | undefined;
    let enabled = false;
    for (const loggerInfo of loggers) {
      if (!loggerInfo.isEnabled(logLevel)) {
        continue;
      }
      try {
        if (loggerInfo.logger.isEnabled(logLevel)) {
          enabled = true;
          break;
        }
      } catch (ex) {
        (errors ??= []).push(ex);
      }
    }

    if (errors !== undefined && errors.length) {
      throwLoggingError(errors);
    }
    return enabled;
  }

  public beginScope<TState>(state: TState): Disposable | undefined {
    const loggers = this.scopeLoggers;
    if (loggers === undefined) {
      return NULL_SCOPE;
    }

    if (loggers.length === 1) {
      return loggers[0]!.createScope(state);
    }

    const scopes: (Disposable | undefined)[] = [];
    let errors: unknown[] | undefined;
    for (const scopeLogger of loggers) {
      try {
        scopes.push(scopeLogger.createScope(state));
      } catch (ex) {
        (errors ??= []).push(ex);
      }
    }

    if (errors !== undefined && errors.length) {
      throwLoggingError(errors);
    }

    return {
      [Symbol.dispose]() {
        for (const scope of scopes) {
          scope?.[Symbol.dispose]();
        }
      },
    };
  }
}

/** Re-throws one or more sink failures as a single aggregate (reference `AggregateException`). */
function throwLoggingError(errors: readonly unknown[]): never {
  throw new AggregateError(errors, "An error occurred while writing to logger(s).");
}
