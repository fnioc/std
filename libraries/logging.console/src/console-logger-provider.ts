// ConsoleLoggerProvider — a minimal port of the reference console provider.
//
// The reference provider owns an options monitor, a formatter registry, and a
// background queue processor that it flushes on dispose. All OUT OF SCOPE this
// pass: this provider only caches one ConsoleLogger per category and its
// dispose is a no-op (the loggers write synchronously, so there is nothing to
// flush).

import type { ILogger, ILoggerProvider } from "@rhombus-std/logging.core";
import { ConsoleLogger } from "./console-logger";

/** An {@link ILoggerProvider} that creates stdout-writing {@link ConsoleLogger}s. */
export class ConsoleLoggerProvider implements ILoggerProvider {
  private readonly loggers = new Map<string, ConsoleLogger>();

  /** Creates (or returns the cached) {@link ConsoleLogger} for `categoryName`. */
  public createLogger(categoryName: string): ILogger {
    let logger = this.loggers.get(categoryName);
    if (logger === undefined) {
      logger = new ConsoleLogger(categoryName);
      this.loggers.set(categoryName, logger);
    }
    return logger;
  }

  /** No-op: the synchronous loggers hold no resources to release. */
  public [Symbol.dispose](): void {}
}
