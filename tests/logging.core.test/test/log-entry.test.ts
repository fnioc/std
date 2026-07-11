// LogEntry — now homed in logging.core (retired from logging.console, which
// re-exports it). Structural, so the meaningful check is that an object with the
// documented shape satisfies `LogEntry<TState>` and its fields read back.

import { EventId, type LogEntry, LogLevel } from '@rhombus-std/logging.core';
import { describe, expect, test } from 'bun:test';

describe('LogEntry', () => {
  test('bundles the deconstructed ILogger.log arguments', () => {
    const entry: LogEntry<string> = {
      logLevel: LogLevel.Information,
      category: 'Orders',
      eventId: new EventId(1, 'placed'),
      state: 'order placed',
      error: undefined,
      formatter: (state, _error) => state,
    };

    expect(entry.logLevel).toBe(LogLevel.Information);
    expect(entry.category).toBe('Orders');
    expect(entry.eventId.name).toBe('placed');
    expect(entry.formatter(entry.state, entry.error)).toBe('order placed');
  });
});
