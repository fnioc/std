// LoggerFactoryExtensions — the type-receiving `createLogger` wrapper
// (black-box via the public logging.core surface; the concrete factories come
// from @rhombus-std/logging). The set is standalone-only by design: its one
// member's name IS ILoggerFactory's own `createLogger` primitive, so it is
// never registered or prototype-installed (§29/§40 exclusion precedent).

import { LoggerFactory, NullLogger, NullLoggerFactory } from "@rhombus-std/logging";
import { type ILogger, type ILoggerFactory, LoggerFactoryExtensions } from "@rhombus-std/logging.core";
import { describe, expect, test } from "bun:test";

class OrderProcessor {}
abstract class PaymentGateway {}

describe("LoggerFactoryExtensions.createLogger", () => {
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

    expect(categories).toEqual(["OrderProcessor", "PaymentGateway"]);
  });

  test("delegates to the factory: the type form and the string form return the same cached logger", () => {
    const factory = new LoggerFactory();
    const viaType = LoggerFactoryExtensions.createLogger(factory, OrderProcessor);
    const viaName = factory.createLogger("OrderProcessor");
    expect(viaType).toBe(viaName);
  });

  test("NullLoggerFactory yields the shared no-op logger", () => {
    const logger = LoggerFactoryExtensions.createLogger(NullLoggerFactory.instance, OrderProcessor);
    expect(logger).toBe(NullLogger.instance);
  });

  test("is standalone-only: the concrete factories' own createLogger survives un-clobbered", () => {
    // If the member had been prototype-installed it would have overwritten
    // LoggerFactory's own `createLogger`, and this plain string call would
    // recurse into the installed thunk forever.
    const factory = new LoggerFactory();
    const logger = factory.createLogger("plain-category");
    expect(logger).toBeDefined();
    expect(Object.getOwnPropertyNames(LoggerFactory.prototype)).toContain("createLogger");
  });
});
