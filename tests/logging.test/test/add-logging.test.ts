// addLogging registration + LoggerFactory.create + the open ILogger<T>
// registration + setMinimumLevel — black-box, resolving through a real
// @rhombus-std/di container.

import { ServiceManifest } from '@rhombus-std/di';
import { closeToken } from '@rhombus-std/di.core';
import { LOGGER_FACTORY_TOKEN, LoggerFactory } from '@rhombus-std/logging';
import type { ILogger, ILoggerFactory } from '@rhombus-std/logging.core';
import { logError, LogLevel, logTrace, logWarning } from '@rhombus-std/logging.core';
import { describe, expect, test } from 'bun:test';
import { RecordingProvider } from './helpers';

// The di token the closing ILogger<T> registration derives from ILogger — the
// same string `nameof<ILogger>()` lowers to inside addLogging.
const ILOGGER_TOKEN = '@rhombus-std/logging.core:ILogger';

function levels(provider: RecordingProvider, category: string): LogLevel[] {
  return (provider.loggers.get(category)?.records ?? []).map((r) => r.level);
}

describe('addLogging', () => {
  test('registers a working singleton ILoggerFactory over the added providers', () => {
    const provider = new RecordingProvider();
    const services = new ServiceManifest();
    services.addLogging((builder) => builder.addProvider(provider));

    using root = services.build().createScope('singleton');
    const factory = root.resolve<ILoggerFactory>(LOGGER_FACTORY_TOKEN);
    const another = root.resolve<ILoggerFactory>(LOGGER_FACTORY_TOKEN);
    expect(factory).toBe(another); // singleton

    const logger = factory.createLogger('App');
    logError(logger, 'e');
    expect(levels(provider, 'App')).toEqual([LogLevel.Error]);
  });

  test('defaults the minimum level to Information', () => {
    const provider = new RecordingProvider();
    const services = new ServiceManifest();
    services.addLogging((builder) => builder.addProvider(provider));

    using root = services.build().createScope('singleton');
    const factory = root.resolve<ILoggerFactory>(LOGGER_FACTORY_TOKEN);
    const logger = factory.createLogger('App');

    logTrace(logger, 't');
    logError(logger, 'e');
    expect(levels(provider, 'App')).toEqual([LogLevel.Error]);
  });

  test('resolves ILogger<T> with the category derived from the closing type token', () => {
    const provider = new RecordingProvider();
    const services = new ServiceManifest();
    services.addLogging((builder) => builder.addProvider(provider));

    using root = services.build().createScope('singleton');
    const logger = root.resolve<ILogger>(closeToken(ILOGGER_TOKEN, 'svc:PaymentService'));
    logError(logger, 'boom');

    expect(levels(provider, 'PaymentService')).toEqual([LogLevel.Error]);
  });
});

describe('LoggerFactory.create', () => {
  test('builds a working factory from a configure delegate', () => {
    const provider = new RecordingProvider();
    using factory = LoggerFactory.create((builder) => builder.addProvider(provider));

    const logger = factory.createLogger('Cat');
    logError(logger, 'e');
    expect(levels(provider, 'Cat')).toEqual([LogLevel.Error]);
  });

  test('disposing the created factory is safe', () => {
    const provider = new RecordingProvider();
    const factory = LoggerFactory.create((builder) => builder.addProvider(provider));
    factory.createLogger('Cat');
    expect(() => factory[Symbol.dispose]()).not.toThrow();
  });
});

describe('setMinimumLevel', () => {
  test('raises the effective floor above the addLogging default', () => {
    const provider = new RecordingProvider();
    using factory = LoggerFactory.create((builder) => {
      builder.addProvider(provider).setMinimumLevel(LogLevel.Error);
    });

    const logger = factory.createLogger('Cat');
    logWarning(logger, 'w');
    logError(logger, 'e');
    expect(levels(provider, 'Cat')).toEqual([LogLevel.Error]);
  });
});
