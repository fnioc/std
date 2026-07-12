// LoggerFactoryExtensions — the type-receiving `createLogger` wrapper
// (black-box via the public logging.core surface; the concrete factories come
// from @rhombus-std/logging). Its member shares ILoggerFactory's own
// `createLogger` primitive name, so it installs as a DISPATCHER over the
// primitive: a type (constructor) routes to the wrapper, a category string to
// the primitive — dot-callable at runtime on any decorated factory.

import { LoggerFactory, NullLogger, NullLoggerFactory } from '@rhombus-std/logging';
import { type ILogger, type ILoggerFactory, LoggerFactoryExtensions } from '@rhombus-std/logging.core';
import { describe, expect, test } from 'bun:test';

/** The method-form surface `@augment` installs at runtime (not statically typed, §36 + TS2430). */
type WithTypeCreateLogger = { createLogger(type: abstract new(...args: never) => unknown): ILogger; };

class OrderProcessor {}
abstract class PaymentGateway {}

describe('LoggerFactoryExtensions.createLogger', () => {
  test("derives the category from the constructor's name", () => {
    const categories: string[] = [];
    const recording: ILoggerFactory = {
      createLogger(categoryName: string): ILogger {
        categories.push(categoryName);
        return NullLogger.instance;
      },
      addProvider(): void {},
      [Symbol.dispose](): void {},
    };

    LoggerFactoryExtensions.createLogger(recording, OrderProcessor);
    // Abstract constructors are accepted — only the name is read.
    LoggerFactoryExtensions.createLogger(recording, PaymentGateway);

    expect(categories).toEqual(['OrderProcessor', 'PaymentGateway']);
  });

  test('delegates to the factory: the type form and the string form return the same cached logger', () => {
    const factory = new LoggerFactory();
    const viaType = LoggerFactoryExtensions.createLogger(factory, OrderProcessor);
    const viaName = factory.createLogger('OrderProcessor');
    expect(viaType).toBe(viaName);
  });

  test('NullLoggerFactory yields the shared no-op logger', () => {
    const logger = LoggerFactoryExtensions.createLogger(NullLoggerFactory.instance, OrderProcessor);
    expect(logger).toBe(NullLogger.instance);
  });

  test('the primitive createLogger(string) still works (a string routes to the primitive, no recursion)', () => {
    const factory = new LoggerFactory();
    const logger = factory.createLogger('plain-category');
    expect(logger).toBeDefined();
    expect(Object.getOwnPropertyNames(LoggerFactory.prototype)).toContain('createLogger');
  });

  test('the convenience form is dot-callable on a decorated factory (a type routes to the wrapper)', () => {
    const factory = new LoggerFactory() as LoggerFactory & WithTypeCreateLogger;

    // Passing a constructor routes to the wrapper, which derives the category
    // from the class name — the same logger the string form caches.
    const viaType = factory.createLogger(OrderProcessor);
    const viaName = factory.createLogger('OrderProcessor');
    expect(viaType).toBe(viaName);
  });

  test('NullLoggerFactory dispatches the type form to the shared no-op logger', () => {
    const factory = NullLoggerFactory.instance as NullLoggerFactory & WithTypeCreateLogger;
    expect(factory.createLogger(OrderProcessor)).toBe(NullLogger.instance);
  });
});
