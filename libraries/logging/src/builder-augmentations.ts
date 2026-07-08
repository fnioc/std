// Reverse-direction dual-export (docs §17) for the ILoggingBuilder extensions.
// Their receiver is logging.core's own ILoggingBuilder and the concrete
// LoggingBuilder lives here, so both the declaration merge (onto the interface AND
// the concrete class, so the class still satisfies `implements ILoggingBuilder`
// once the names are on it) and the runtime install live in this package. The
// standalone free-function form ships from ./builder-extensions.
//
// setMinimumLevel/clearProviders are deferred throwing stubs (issue #75); giving
// them the method form keeps the surface symmetric -- the method throws exactly as
// the free function does.

import type { ILoggerProvider, ILoggingBuilder, LogLevel } from "@rhombus-std/logging.core";
import { applyExtensions, defineExtensions } from "@rhombus-std/primitives";
import { addProvider, clearProviders, setMinimumLevel } from "./builder-extensions";
import { LoggingBuilder } from "./logging-builder";

declare module "@rhombus-std/logging.core" {
  interface ILoggingBuilder {
    addProvider(provider: ILoggerProvider): this;
    setMinimumLevel(level: LogLevel): this;
    clearProviders(): this;
  }
}

declare module "./logging-builder" {
  interface LoggingBuilder {
    addProvider(provider: ILoggerProvider): this;
    setMinimumLevel(level: LogLevel): this;
    clearProviders(): this;
  }
}

applyExtensions<ILoggingBuilder>(
  LoggingBuilder,
  defineExtensions<ILoggingBuilder>()({ addProvider, setMinimumLevel, clearProviders }),
);
