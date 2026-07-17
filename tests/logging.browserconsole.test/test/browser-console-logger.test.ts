import type { IServiceManifest, Token } from '@rhombus-std/di.core';
import { LOGGER_PROVIDER_TOKEN, LoggingBuilder } from '@rhombus-std/logging';
import { BrowserConsoleLogger, BrowserConsoleLoggerExtensions, BrowserConsoleLoggerProvider, type ConsoleLike,
  consoleMethodFor } from '@rhombus-std/logging.browserconsole';
import { EventId, LogLevel } from '@rhombus-std/logging.core';
import { expect, test } from 'bun:test';

/** A recording stand-in for the di.core registration builder. */
function fakeServices(): { services: IServiceManifest; values: [Token, unknown][]; } {
  const values: [Token, unknown][] = [];
  const services = {
    addValue(token: Token, value: unknown): void {
      values.push([token, value]);
    },
  } as unknown as IServiceManifest;
  return { services, values };
}

/** Records every console call as `[method, args]`. */
function makeConsoleSpy(): { console: ConsoleLike; calls: [string, unknown[]][]; } {
  const calls: [string, unknown[]][] = [];
  const record = (method: string) => {
    return (...args: unknown[]): void => {
      calls.push([method, args]);
    };
  };
  return {
    console: {
      error: record('error'),
      warn: record('warn'),
      info: record('info'),
      debug: record('debug'),
    },
    calls,
  };
}

function write(logger: BrowserConsoleLogger, level: LogLevel, message: string, error?: Error): void {
  logger.log(level, new EventId(7), message, error, (state) => {
    return String(state);
  });
}

test('each LogLevel maps onto its console method', () => {
  expect(consoleMethodFor(LogLevel.Trace)).toBe('debug');
  expect(consoleMethodFor(LogLevel.Debug)).toBe('debug');
  expect(consoleMethodFor(LogLevel.Information)).toBe('info');
  expect(consoleMethodFor(LogLevel.Warning)).toBe('warn');
  expect(consoleMethodFor(LogLevel.Error)).toBe('error');
  expect(consoleMethodFor(LogLevel.Critical)).toBe('error');
  expect(() => {
    return consoleMethodFor(LogLevel.None);
  }).toThrow(RangeError);
});

test('log routes each level through the mapped console method', () => {
  const spy = makeConsoleSpy();
  const logger = new BrowserConsoleLogger('App', spy.console);

  write(logger, LogLevel.Trace, 't');
  write(logger, LogLevel.Debug, 'd');
  write(logger, LogLevel.Information, 'i');
  write(logger, LogLevel.Warning, 'w');
  write(logger, LogLevel.Error, 'e');
  write(logger, LogLevel.Critical, 'c');

  expect(spy.calls.map(([method]) => {
    return method;
  })).toEqual(['debug', 'debug', 'info', 'warn', 'error', 'error']);
});

test('the rendered line is category[eventId] message; an Error rides as a separate console arg', () => {
  const spy = makeConsoleSpy();
  const logger = new BrowserConsoleLogger('App.Service', spy.console);

  write(logger, LogLevel.Information, 'hello');
  const failure = new Error('boom');
  write(logger, LogLevel.Error, 'failed', failure);

  expect(spy.calls[0]).toEqual(['info', ['App.Service[7] hello']]);
  expect(spy.calls[1]).toEqual(['error', ['App.Service[7] failed', failure]]);
});

test('LogLevel.None is not enabled and writes nothing', () => {
  const spy = makeConsoleSpy();
  const logger = new BrowserConsoleLogger('App', spy.console);

  expect(logger.isEnabled(LogLevel.None)).toBe(false);
  expect(logger.isEnabled(LogLevel.Trace)).toBe(true);

  write(logger, LogLevel.None, 'never');
  expect(spy.calls).toEqual([]);
});

test('the provider caches one logger per category', () => {
  const spy = makeConsoleSpy();
  const provider = new BrowserConsoleLoggerProvider(spy.console);

  const first = provider.createLogger('A');
  const again = provider.createLogger('A');
  const other = provider.createLogger('B');

  expect(again).toBe(first);
  expect(other).not.toBe(first);
  provider[Symbol.dispose]();
});

test('the no-arg provider falls back to the platform global console', () => {
  // Exercises the `console ?? globalConsole` default branch every other test
  // sidesteps by injecting a spy: binding the global must not throw and the
  // provider still produces BrowserConsoleLoggers.
  const provider = new BrowserConsoleLoggerProvider();

  expect(provider.createLogger('App')).toBeInstanceOf(BrowserConsoleLogger);
  provider[Symbol.dispose]();
});

test('addBrowserConsole registers ONE provider per manifest, however many calls run', () => {
  const { services, values } = fakeServices();
  const builder = new LoggingBuilder(services);

  BrowserConsoleLoggerExtensions.addBrowserConsole(builder);
  BrowserConsoleLoggerExtensions.addBrowserConsole(builder);

  const providers = values.filter(([token]) => {
    return token === LOGGER_PROVIDER_TOKEN;
  });
  expect(providers).toHaveLength(1);
  expect(providers[0]?.[1]).toBeInstanceOf(BrowserConsoleLoggerProvider);
});

test('the per-manifest dedup is keyed by services, not effectively global', () => {
  // A SECOND manifest must get its own provider — proving the WeakMap keys on
  // `builder.services` rather than a shared boolean that would suppress it.
  const first = fakeServices();
  const second = fakeServices();

  BrowserConsoleLoggerExtensions.addBrowserConsole(new LoggingBuilder(first.services));
  BrowserConsoleLoggerExtensions.addBrowserConsole(new LoggingBuilder(second.services));

  const providersFor = (values: [Token, unknown][]) => {
    return values.filter(([token]) => {
      return token === LOGGER_PROVIDER_TOKEN;
    });
  };
  expect(providersFor(first.values)).toHaveLength(1);
  expect(providersFor(second.values)).toHaveLength(1);
  expect(providersFor(first.values)[0]?.[1]).not.toBe(providersFor(second.values)[0]?.[1]);
});

test('the fluent addBrowserConsole method form is installed on LoggingBuilder', () => {
  const { services } = fakeServices();
  const builder = new LoggingBuilder(services);

  expect(builder.addBrowserConsole()).toBe(builder);
});
