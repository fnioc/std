// The filter/selection engine end-to-end: a `LoggerFactory` over a recording
// provider, with `LoggerFilterOptions` rules deciding which writes reach the
// sink. Black-box via the public surface.

import { LoggerFactory, LoggerFilterOptions } from '@rhombus-std/logging';
import { logError, logInformation, LogLevel, logTrace, logWarning } from '@rhombus-std/logging.core';
import { describe, expect, test } from 'bun:test';
import { RecordingProvider, ScopeAwareProvider } from './helpers';

/** The levels the provider's sink for `category` actually recorded. */
function recorded(provider: RecordingProvider, category: string): LogLevel[] {
  return (provider.loggers.get(category)?.records ?? []).map((r) => r.level);
}

describe('LoggerFactory filtering', () => {
  test('the global minLevel filters below-threshold writes', () => {
    const options = new LoggerFilterOptions();
    options.minLevel = LogLevel.Warning;
    const provider = new RecordingProvider();
    using factory = new LoggerFactory([provider], options);

    const logger = factory.createLogger('App');
    logInformation(logger, 'info');
    logWarning(logger, 'warn');
    logError(logger, 'err');

    expect(recorded(provider, 'App')).toEqual([LogLevel.Warning, LogLevel.Error]);
  });

  test('a category rule overrides the global level for matching categories', () => {
    const options = new LoggerFilterOptions();
    options.minLevel = LogLevel.Information;
    options.addFilter('App.Noisy', LogLevel.Error);
    const provider = new RecordingProvider();
    using factory = new LoggerFactory([provider], options);

    const noisy = factory.createLogger('App.Noisy.Component');
    const other = factory.createLogger('App.Other');
    logWarning(noisy, 'w');
    logError(noisy, 'e');
    logWarning(other, 'w');

    expect(recorded(provider, 'App.Noisy.Component')).toEqual([LogLevel.Error]);
    expect(recorded(provider, 'App.Other')).toEqual([LogLevel.Warning]);
  });

  test('the most-specific (longest category) rule wins', () => {
    const options = new LoggerFilterOptions();
    options.addFilter('App', LogLevel.Warning);
    options.addFilter('App.Db', LogLevel.Trace);
    const provider = new RecordingProvider();
    using factory = new LoggerFactory([provider], options);

    const db = factory.createLogger('App.Db.Query');
    logTrace(db, 't');

    expect(recorded(provider, 'App.Db.Query')).toEqual([LogLevel.Trace]);
  });

  test('a None-level rule disables the sink for that category', () => {
    const options = new LoggerFilterOptions();
    options.addFilter('Muted', LogLevel.None);
    const provider = new RecordingProvider();
    using factory = new LoggerFactory([provider], options);

    const logger = factory.createLogger('Muted.X');
    expect(logger.isEnabled(LogLevel.Critical)).toBe(false);
    logError(logger, 'e');

    expect(recorded(provider, 'Muted.X')).toEqual([]);
  });

  test('a raw filter delegate gates by (provider, category, level)', () => {
    const options = new LoggerFilterOptions();
    options.addFilter((_provider, category, level) => category === 'Yes' && level >= LogLevel.Warning);
    const provider = new RecordingProvider();
    using factory = new LoggerFactory([provider], options);

    const yes = factory.createLogger('Yes');
    const no = factory.createLogger('No');
    logError(yes, 'e');
    logInformation(yes, 'i');
    logError(no, 'e');

    expect(recorded(provider, 'Yes')).toEqual([LogLevel.Error]);
    expect(recorded(provider, 'No')).toEqual([]);
  });

  test('a provider added after loggers exist is filtered live', () => {
    const options = new LoggerFilterOptions();
    options.minLevel = LogLevel.Warning;
    const first = new RecordingProvider();
    using factory = new LoggerFactory([first], options);

    const logger = factory.createLogger('App');
    const second = new RecordingProvider();
    factory.addProvider(second);

    logInformation(logger, 'i');
    logError(logger, 'e');

    expect(recorded(first, 'App')).toEqual([LogLevel.Error]);
    expect(recorded(second, 'App')).toEqual([LogLevel.Error]);
  });
});

describe('LoggerFactory external scope', () => {
  test("scopes opened on the composite reach a scope-aware provider's sink", () => {
    const provider = new ScopeAwareProvider();
    using factory = new LoggerFactory([provider]);
    const logger = factory.createLogger('Cat');

    expect(provider.scopeProvider).toBeDefined();

    using _scope = logger.beginScope('op-1');
    logError(logger, 'boom');

    expect(provider.seenScopes).toEqual([['op-1']]);
  });
});
