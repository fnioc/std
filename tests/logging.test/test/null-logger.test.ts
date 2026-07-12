// NullLogger — the no-op ILogger, including the generic-category `NullLogger<T>`
// spelling. `ILogger<TCategoryName>`'s parameter is phantom, so the singleton and
// any `NullLogger<T>` are the same no-op; the parameter is reference-parity only
// (decisions.md §77).

import { NullLogger } from '@rhombus-std/logging';
import { EventId, type ILogger, logError, LogLevel } from '@rhombus-std/logging.core';
import { describe, expect, test } from 'bun:test';

// A stand-in category type for the generic spelling.
interface PaymentService {
  readonly id: string;
}

describe('NullLogger', () => {
  test('the shared singleton is disabled at every level and never throws', () => {
    expect(NullLogger.instance.isEnabled(LogLevel.Critical)).toBe(false);
    expect(() => logError(NullLogger.instance, 'boom')).not.toThrow();
  });

  test('NullLogger.instance satisfies an ILogger<T> slot (phantom category)', () => {
    // The singleton is typed NullLogger<unknown>; because TCategoryName is a
    // phantom, it is assignable to a closed ILogger<PaymentService> slot.
    const typed: ILogger<PaymentService> = NullLogger.instance;
    expect(typed.isEnabled(LogLevel.Error)).toBe(false);
  });

  test('new NullLogger<T>() is a freshly-typed no-op that never formats', () => {
    const logger = new NullLogger<PaymentService>();
    expect(logger.isEnabled(LogLevel.Information)).toBe(false);

    let formatted = false;
    logger.log(LogLevel.Information, new EventId(1), 'state', undefined, () => {
      formatted = true;
      return 'msg';
    });
    // A no-op logger discards the write without ever rendering the state.
    expect(formatted).toBe(false);
  });

  test('beginScope returns a no-op disposable', () => {
    const logger = new NullLogger<PaymentService>();
    const scope = logger.beginScope({ id: '1' });
    expect(scope).toBeDefined();
    expect(() => scope?.[Symbol.dispose]()).not.toThrow();
  });
});
