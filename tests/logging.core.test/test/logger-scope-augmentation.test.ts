// The `log` / `beginScope` wrappers share their names with `ILogger`'s own
// primitives, so each installs as a DISPATCHER over the primitive:
//   - `log`: an `EventId` second argument routes to the primitive, a message
//     string (or leading Error) to the wrapper.
//   - `beginScope`: a lone value (including a bare string) routes to the
//     primitive as raw state, a format string WITH args to the wrapper.
// The convenience forms are thus dot-callable at runtime on any decorated logger.
// Black-box via the public logging.core surface.

import { NullLogger } from '@rhombus-std/logging';
import { EventId, FormattedLogValues, type ILogger, LoggerExtensions, LogLevel } from '@rhombus-std/logging.core';
import { augment } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

// The `nameof<ILogger>()`-derived augmentation token (a no-transformer test uses
// the derived literal directly). `ILogger`'s defaulted `TCategoryName` parameter
// lowers into the token as `<unknown>`.
const ILOGGER_TOKEN = '@rhombus-std/logging.core:ILogger<unknown>';

/** A logger that records the state handed to `beginScope` and returns a token. */
function recordingLogger(): { logger: ILogger; scopes: unknown[]; } {
  const scopes: unknown[] = [];
  // Partial ILogger double — only the primitives this test exercises; cast past
  // the merged wrapper members (§80) it never calls.
  const logger = {
    log(): void {},
    isEnabled(): boolean {
      return true;
    },
    beginScope<TState>(state: TState): Disposable {
      scopes.push(state);
      return { [Symbol.dispose]() {} };
    },
  } as unknown as ILogger;
  return { logger, scopes };
}

/** A `@augment(ILogger)`-decorated recording logger, so the method form installs. */
class DecoratedRecordingLogger implements ILogger {
  public readonly scopes: unknown[] = [];
  public readonly logs: { eventId: EventId; state: unknown; }[] = [];
  public log<TState>(
    _logLevel: LogLevel,
    eventId: EventId,
    state: TState,
    _error: Error | undefined,
    _formatter: (state: TState, error: Error | undefined) => string,
  ): void {
    this.logs.push({ eventId, state });
  }
  public isEnabled(): boolean {
    return true;
  }
  public beginScope<TState>(state: TState): Disposable {
    this.scopes.push(state);
    return { [Symbol.dispose]() {} };
  }
}
// The `@augment` install lands the merged wrapper members on `ILogger`, so
// `implements ILogger` now requires them on the class — the empty extends-merge
// binds them body-free (§71/§80), exactly as the concrete loggers do.
interface DecoratedRecordingLogger extends ILogger {}
augment(ILOGGER_TOKEN)(DecoratedRecordingLogger);

// The convenience method forms `@augment` installs at runtime — not statically
// typed onto the class (TS2430: `log`/`beginScope` share their names with
// `ILogger`'s body-declared primitives), so intersected in at the call site.
type LoggerConvenience = {
  log(logLevel: LogLevel, message: string, ...args: unknown[]): void;
  beginScope(messageFormat: string, ...args: unknown[]): Disposable | undefined;
};

/** A decorated recording logger widened to its runtime convenience method forms. */
function decoratedLogger(): DecoratedRecordingLogger & LoggerConvenience {
  return new DecoratedRecordingLogger() as DecoratedRecordingLogger & LoggerConvenience;
}

describe('LoggerExtensions.beginScope', () => {
  test('formats the template into a FormattedLogValues state and opens the scope', () => {
    const { logger, scopes } = recordingLogger();

    const scope = LoggerExtensions.beginScope(logger, 'Processing request {Id} from {Address}', 42, '10.0.0.1');

    expect(scope).toBeDefined();
    expect(scopes).toHaveLength(1);
    const state = scopes[0];
    expect(state).toBeInstanceOf(FormattedLogValues);
    expect(String(state)).toBe('Processing request 42 from 10.0.0.1');
    expect([...(state as FormattedLogValues)]).toEqual([
      ['Id', 42],
      ['Address', '10.0.0.1'],
      ['{OriginalFormat}', 'Processing request {Id} from {Address}'],
    ]);
  });

  test("a concrete logger's beginScope primitive still takes raw state (no recursion)", () => {
    // The dispatcher routes a lone value (here an object) to the primitive, so
    // NullLogger's own `beginScope` runs — no wrapping, no recursion.
    const scope = NullLogger.instance.beginScope({ some: 'state' });
    expect(scope).toBeDefined();
    expect(typeof scope[Symbol.dispose]).toBe('function');
  });

  test('the convenience form is dot-callable on a decorated logger (format + args → wrapper)', () => {
    const logger = decoratedLogger();

    // A format string WITH args → the wrapper, which hands the primitive a
    // FormattedLogValues state.
    const scope = logger.beginScope('Processing {Id}', 7);
    expect(scope).toBeDefined();
    expect(logger.scopes).toHaveLength(1);
    expect(logger.scopes[0]).toBeInstanceOf(FormattedLogValues);
    expect(String(logger.scopes[0])).toBe('Processing 7');
  });

  test('a lone string on a decorated logger stays raw primitive state', () => {
    const logger = decoratedLogger();

    // No format args → the primitive, so the string is the raw scope state (the
    // reference's instance-method-wins overload resolution).
    logger.beginScope('op-1');
    expect(logger.scopes).toEqual(['op-1']);
  });
});

describe('LoggerExtensions.log (dispatched over the primitive)', () => {
  test('a message string routes to the wrapper (convenience dot-callable)', () => {
    const logger = decoratedLogger();

    logger.log(LogLevel.Information, 'hello {x}', 7);

    expect(logger.logs).toHaveLength(1);
    // The wrapper synthesizes a zero EventId and a FormattedLogValues state.
    expect(logger.logs[0]!.eventId.id).toBe(0);
    expect(logger.logs[0]!.state).toBeInstanceOf(FormattedLogValues);
    expect(String(logger.logs[0]!.state)).toBe('hello 7');
  });

  test('an EventId second argument routes to the primitive (no recursion)', () => {
    const logger = decoratedLogger();

    logger.log(LogLevel.Information, EventId.from(5), 'raw-state', undefined, () => 'rendered');

    expect(logger.logs).toHaveLength(1);
    expect(logger.logs[0]!.eventId.id).toBe(5);
    expect(logger.logs[0]!.state).toBe('raw-state');
  });
});
