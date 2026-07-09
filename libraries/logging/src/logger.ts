// Logger — the composite ILogger that fans a write out across the sinks of
// every registered provider, ported from ME.Logging's internal `Logger`.
//
// The reference `Logger` also applies per-(provider,category) filter rules
// (`MessageLogger.IsEnabled`) computed from `LoggerFilterOptions`. That filter
// layer is NOT wired here — it needs the options-monitor DI integration that
// this repo's options package deliberately defers (@rhombus-std/options README).
// Instead each sink's own `isEnabled` gates it, which is the correct behavior
// for a no-filter setup and the honest v1 given providers are out of scope
// (issue #75). Cross-sink exception aggregation (the reference collects sink
// throws into an AggregateException) is likewise omitted — a throwing sink
// propagates.

import type { EventId, ILogger, LoggerExtensionMethods, LogLevel } from "@rhombus-std/logging.core";
import { augment } from "@rhombus-std/primitives";
import { nameof } from "@rhombus-std/primitives.transformer/internal/nameof";
import type { Func } from "@rhombus-toolkit/func";

// The class-side type merge for the registry-installed `LoggerExtensions`
// methods (log/logInformation/…). `ILogger` itself gets NO interface merge
// (§36: many implementers); the method form is typed here, exactly where
// `@augment(nameof<ILogger>())` installs it.
export interface Logger extends LoggerExtensionMethods {}

@augment(nameof<ILogger>())
export class Logger implements ILogger {
  // Held BY REFERENCE (never reassigned or copied) so that LoggerFactory can
  // append a late-added provider's sink and have this composite see it live.
  readonly #sinks: ILogger[];

  public constructor(sinks: ILogger[]) {
    this.#sinks = sinks;
  }

  public log<TState>(
    logLevel: LogLevel,
    eventId: EventId,
    state: TState,
    error: Error | undefined,
    formatter: Func<[TState, Error | undefined], string>,
  ): void {
    for (const sink of this.#sinks) {
      if (sink.isEnabled(logLevel)) {
        sink.log(logLevel, eventId, state, error, formatter);
      }
    }
  }

  public isEnabled(logLevel: LogLevel): boolean {
    for (const sink of this.#sinks) {
      if (sink.isEnabled(logLevel)) {
        return true;
      }
    }
    return false;
  }

  public beginScope<TState>(state: TState): Disposable | undefined {
    const scopes: Disposable[] = [];
    for (const sink of this.#sinks) {
      const scope = sink.beginScope(state);
      if (scope) {
        scopes.push(scope);
      }
    }
    if (!scopes.length) {
      return undefined;
    }
    return {
      [Symbol.dispose]() {
        for (const scope of scopes) {
          scope[Symbol.dispose]();
        }
      },
    };
  }
}
