// Shared test doubles: recording providers/sinks whose `isEnabled` always
// returns true, so the FILTER layer (not the sink) is what gates a write — the
// point of exercising the filter engine.

import type { EventId, IExternalScopeProvider, ILogger, ILoggerProvider, ISupportExternalScope,
  LogLevel } from '@rhombus-std/logging.core';
import type { Func } from '@rhombus-toolkit/func';

/** A recorded write: its level and rendered message. */
export interface Record {
  level: LogLevel;
  message: string;
}

/** A sink that records every write it is asked to make and always reports enabled. */
// Binds the augmented `ILogger` symbol onto the fake so the merged wrapper
// methods (logInformation/…, §80) are declared on it; never called here.
export interface RecordingLogger extends ILogger {}
export class RecordingLogger implements ILogger {
  public readonly records: Record[] = [];
  public readonly scopes: unknown[] = [];

  public constructor(public readonly category: string) {}

  public log<TState>(
    logLevel: LogLevel,
    _eventId: EventId,
    state: TState,
    error: Error | undefined,
    formatter: Func<[TState, Error | undefined], string>,
  ): void {
    this.records.push({ level: logLevel, message: formatter(state, error) });
  }

  public isEnabled(_logLevel: LogLevel): boolean {
    return true;
  }

  public beginScope<TState>(state: TState): Disposable {
    this.scopes.push(state);
    return { [Symbol.dispose]() {} };
  }
}

/** A provider that hands out one shared {@link RecordingLogger} per category. */
export class RecordingProvider implements ILoggerProvider {
  public readonly loggers = new Map<string, RecordingLogger>();
  public disposed = false;

  public createLogger(categoryName: string): ILogger {
    let logger = this.loggers.get(categoryName);
    if (logger === undefined) {
      logger = new RecordingLogger(categoryName);
      this.loggers.set(categoryName, logger);
    }
    return logger;
  }

  public only(): RecordingLogger {
    const [logger] = this.loggers.values();
    if (logger === undefined) {
      throw new Error('no logger created yet');
    }
    return logger;
  }

  public [Symbol.dispose](): void {
    this.disposed = true;
  }
}

/**
 * A provider implementing {@link ISupportExternalScope}: its sink, on each
 * write, snapshots the ambient scopes the factory-supplied provider reports.
 */
export class ScopeAwareProvider implements ILoggerProvider, ISupportExternalScope {
  public scopeProvider: IExternalScopeProvider | undefined;
  public readonly seenScopes: unknown[][] = [];

  public setScopeProvider(scopeProvider: IExternalScopeProvider): void {
    this.scopeProvider = scopeProvider;
  }

  public createLogger(_categoryName: string): ILogger {
    const seenScopes = this.seenScopes;
    const providerRef = this;
    // Partial ILogger double — only the primitives this provider exercises; cast
    // past the merged wrapper members (§80) it never calls.
    return {
      log: () => {
        const active: unknown[] = [];
        providerRef.scopeProvider?.forEachScope((scope: unknown) => active.push(scope), undefined);
        seenScopes.push(active);
      },
      isEnabled: () => true,
      beginScope: () => ({ [Symbol.dispose]() {} }),
    } as unknown as ILogger;
  }

  public [Symbol.dispose](): void {}
}
