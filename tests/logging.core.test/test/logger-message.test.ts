// LoggerMessage — the cached-delegate factories. `define` returns a level/event
// bound log action; `defineScope` returns a scope-opening action. Black-box via
// the public logging.core surface.

import { EventId, type ILogger, LoggerMessage, LogLevel } from "@rhombus-std/logging.core";
import { describe, expect, test } from "bun:test";

interface Written {
  readonly logLevel: LogLevel;
  readonly eventId: EventId;
  readonly message: string;
  readonly error: Error | undefined;
}

/** A logger that records each `log` call (rendering the state) and each scope. */
function recordingLogger(enabled = true): { logger: ILogger; written: Written[]; scopes: unknown[] } {
  const written: Written[] = [];
  const scopes: unknown[] = [];
  const logger: ILogger = {
    log<TState>(
      logLevel: LogLevel,
      eventId: EventId,
      state: TState,
      error: Error | undefined,
      formatter: (state: TState, error: Error | undefined) => string,
    ): void {
      written.push({ logLevel, eventId, message: formatter(state, error), error });
    },
    isEnabled(): boolean {
      return enabled;
    },
    beginScope<TState>(state: TState): Disposable {
      scopes.push(state);
      return { [Symbol.dispose]() {} };
    },
  };
  return { logger, written, scopes };
}

describe("LoggerMessage.define", () => {
  test("binds level/event/template and renders the message with no args", () => {
    const { logger, written } = recordingLogger();
    const logStarted = LoggerMessage.define(LogLevel.Information, 1, "Application started");

    logStarted(logger, undefined);

    expect(written).toHaveLength(1);
    expect(written[0]?.logLevel).toBe(LogLevel.Information);
    expect(written[0]?.eventId.id).toBe(1);
    expect(written[0]?.message).toBe("Application started");
    expect(written[0]?.error).toBeUndefined();
  });

  test("substitutes typed args into the template in order", () => {
    const { logger, written } = recordingLogger();
    const logConnected = LoggerMessage.define<string, number>(
      LogLevel.Warning,
      new EventId(2),
      "Connected to {Host} on attempt {Attempt}",
    );

    logConnected(logger, "db-primary", 3, undefined);

    expect(written[0]?.logLevel).toBe(LogLevel.Warning);
    expect(written[0]?.message).toBe("Connected to db-primary on attempt 3");
  });

  test("passes the trailing error through", () => {
    const { logger, written } = recordingLogger();
    const logFailed = LoggerMessage.define<string>(LogLevel.Error, 3, "Job {Job} failed");
    const boom = new Error("boom");

    logFailed(logger, "reindex", boom);

    expect(written[0]?.message).toBe("Job reindex failed");
    expect(written[0]?.error).toBe(boom);
  });

  test("skips writing when the level is disabled", () => {
    const { logger, written } = recordingLogger(false);
    const logStarted = LoggerMessage.define(LogLevel.Information, 1, "Application started");

    logStarted(logger, undefined);

    expect(written).toHaveLength(0);
  });

  test("skipEnabledCheck writes even when the level is disabled", () => {
    const { logger, written } = recordingLogger(false);
    const logStarted = LoggerMessage.define(LogLevel.Information, 1, "Application started", {
      skipEnabledCheck: true,
    });

    logStarted(logger, undefined);

    expect(written).toHaveLength(1);
  });
});

describe("LoggerMessage.defineScope", () => {
  test("opens a scope whose state renders the templated message", () => {
    const { logger, scopes } = recordingLogger();
    const requestScope = LoggerMessage.defineScope<number>("Request {Id}");

    const scope = requestScope(logger, 42);

    expect(scope).toBeDefined();
    expect(scopes).toHaveLength(1);
    expect(String(scopes[0])).toBe("Request 42");
  });
});
