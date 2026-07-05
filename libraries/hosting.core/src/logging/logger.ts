/**
 * Local stand-in for the eventual `@rhombus-std/logging` package. Hosting
 * needs *some* logging shape to reference from `IHost`/`IHostBuilder`, but
 * a real logging package doesn't exist yet -- these types are intentionally
 * minimal and will be replaced by an import from `@rhombus-std/logging`
 * once that package lands.
 */

export enum LogLevel {
  Trace,
  Debug,
  Information,
  Warning,
  Error,
  Critical,
  None,
}

export interface ILogger {
  isEnabled(logLevel: LogLevel): boolean;
  log(logLevel: LogLevel, message: string, error?: unknown): void;
}
