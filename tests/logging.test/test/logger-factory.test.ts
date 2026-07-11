// LoggerFactory construction, caching, fan-out, and provider-disposal
// semantics (black-box).

import { LoggerFactory } from "@rhombus-std/logging";
import { logError, LogLevel } from "@rhombus-std/logging.core";
import { describe, expect, test } from "bun:test";
import { RecordingProvider } from "./helpers";

describe("LoggerFactory", () => {
  test("caches one composite logger per category", () => {
    using factory = new LoggerFactory([new RecordingProvider()]);
    expect(factory.createLogger("A")).toBe(factory.createLogger("A"));
    expect(factory.createLogger("A")).not.toBe(factory.createLogger("B"));
  });

  test("fans a write out across every provider", () => {
    const first = new RecordingProvider();
    const second = new RecordingProvider();
    using factory = new LoggerFactory([first, second]);

    logError(factory.createLogger("Cat"), "e");

    expect(first.loggers.get("Cat")!.records.map((r) => r.level)).toEqual([LogLevel.Error]);
    expect(second.loggers.get("Cat")!.records.map((r) => r.level)).toEqual([LogLevel.Error]);
  });

  test("with no providers behaves as a null factory", () => {
    using factory = new LoggerFactory();
    const logger = factory.createLogger("Cat");
    expect(logger.isEnabled(LogLevel.Critical)).toBe(false);
    expect(() => logError(logger, "e")).not.toThrow();
  });

  test("a provider added via the factory is disposed with the factory", () => {
    const provider = new RecordingProvider();
    const factory = new LoggerFactory();
    factory.addProvider(provider);
    factory[Symbol.dispose]();
    expect(provider.disposed).toBe(true);
  });

  test("a constructor-supplied provider is NOT disposed by the factory", () => {
    // Mirrors the reference: providers supplied at construction are owned by the
    // caller / container, not the factory (ProviderRegistration.ShouldDispose = false).
    const provider = new RecordingProvider();
    const factory = new LoggerFactory([provider]);
    factory[Symbol.dispose]();
    expect(provider.disposed).toBe(false);
  });

  test("createLogger after dispose throws", () => {
    const factory = new LoggerFactory();
    factory[Symbol.dispose]();
    expect(() => factory.createLogger("Cat")).toThrow();
  });
});
