// Reverse-direction dual-export (docs §28) for the ILoggingBuilder augmentations.
// Their receiver is logging.core's own ILoggingBuilder and the concrete
// LoggingBuilder lives here, so both the declaration merge (onto the interface AND
// the concrete class, so the class still satisfies `implements ILoggingBuilder`
// once the names are on it) and the runtime install live in this package. The
// `LoggingBuilderExtensions` object literal ships from ./builder-extensions.
//
// setMinimumLevel/clearProviders are deferred throwing stubs (issue #75); giving
// them the method form keeps the surface symmetric -- the method throws exactly as
// the standalone member does.

import type { ILoggerProvider, LogLevel } from "@rhombus-std/logging.core";
import { applyAugmentations } from "@rhombus-std/primitives";
import { LoggingBuilderExtensions } from "./builder-extensions";
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

applyAugmentations(LoggingBuilder, LoggingBuilderExtensions);
