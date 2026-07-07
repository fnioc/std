// LoggerFactory — produces category loggers by fanning out across the supplied
// providers, ported from ME.Logging's `LoggerFactory`.
//
// Implemented for real to the extent it can be WITHOUT providers or the filter-
// options DI machinery (both out of scope this pass — issue #75). A consumer can
// still construct `new LoggerFactory([myProvider])` and get working per-category
// composite loggers; with no providers it behaves as a null factory.
//
// Deferred vs. the reference:
//   - Filter application (LoggerFilterOptions / IOptionsMonitor). Sink-level
//     `isEnabled` gates messages instead (see ./logger.ts).
//   - ActivityTracking / scope-provider propagation (LoggerFactoryOptions).
//   - The static `Create(configure)` helper, which spins up a full DI container
//     to resolve the factory — that needs the @rhombus-std/di RUNTIME, and this
//     package depends only on di.core (mirror of `Logging -> DI.Abstractions`).

import type { ILogger, ILoggerFactory, ILoggerProvider } from "@rhombus-std/logging.core";
import type { Func } from "@rhombus-toolkit/func";
import { Logger } from "./logger";

export class LoggerFactory implements ILoggerFactory {
  readonly #providers: ILoggerProvider[];
  // category -> { the composite handed out, its live sink array }.
  readonly #loggers = new Map<string, { logger: Logger; sinks: ILogger[] }>();
  #disposed = false;

  public constructor(providers: Iterable<ILoggerProvider> = []) {
    this.#providers = [...providers];
  }

  public createLogger(categoryName: string): ILogger {
    const existing = this.#loggers.get(categoryName);
    if (existing) {
      return existing.logger;
    }
    const sinks = this.#providers.map((provider) => provider.createLogger(categoryName));
    const logger = new Logger(sinks);
    this.#loggers.set(categoryName, { logger, sinks });
    return logger;
  }

  public addProvider(provider: ILoggerProvider): void {
    this.#providers.push(provider);
    // Append the new provider's sink to every already-created composite, in
    // place — Logger holds each `sinks` array by reference (see ./logger.ts).
    for (const [categoryName, entry] of this.#loggers) {
      entry.sinks.push(provider.createLogger(categoryName));
    }
  }

  public [Symbol.dispose](): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    for (const provider of this.#providers) {
      provider[Symbol.dispose]();
    }
  }

  /**
   * Creates a configured {@link ILoggerFactory} from an {@link ILoggingBuilder}
   * delegate.
   *
   * NOT IMPLEMENTED: the reference `Create` builds a DI container
   * (`new ServiceCollection().AddLogging(configure).BuildServiceProvider()`) and
   * resolves `ILoggerFactory` from it. That requires the @rhombus-std/di RUNTIME
   * (to call `build()`), which this package does not depend on — the graph edge
   * is `Logging -> DI.Abstractions` (di.core) only. Compose logging via
   * `manifest.addLogging(...)` against a real @rhombus-std/di manifest instead,
   * or construct `new LoggerFactory([...providers])` directly. (Providers
   * themselves are out of scope this pass — issue #75.)
   */
  public static create(_configure: Func<[unknown], void>): ILoggerFactory {
    throw new Error(
      "LoggerFactory.create() is not implemented: it needs the @rhombus-std/di runtime to build a "
        + "container, but logging depends only on di.core. Use manifest.addLogging(...) with a real "
        + "@rhombus-std/di manifest, or `new LoggerFactory([...providers])`.",
    );
  }
}
