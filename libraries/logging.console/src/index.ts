// Public entry point for @rhombus-std/logging.console — the console-provider
// analog of the reference logging graph. Ships the concrete ConsoleLogger +
// ConsoleLoggerProvider against @rhombus-std/logging.core's contracts.
//
// The advanced reference surface (formatter registry, formatter/logger
// options, colors, scopes, log-level configuration binding, background queue
// writer) is intentionally omitted this pass.

export { ConsoleLogger } from "./console-logger";
export { ConsoleLoggerProvider } from "./console-logger-provider";
