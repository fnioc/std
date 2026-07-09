// addConsole — registers the console logger provider on an ILoggingBuilder, ported
// from ME.Logging.Console's `ConsoleLoggerExtensions.AddConsole(this ILoggingBuilder)`.
//
// ILoggingBuilder is @rhombus-std/logging.core's own interface (an OPEN receiver
// extended across the family), so this downstream sink registers its augmentation
// set against the shared `nameof<ILoggingBuilder>()` token (docs §38): the
// @augment-decorated concrete LoggingBuilder pulls `builder.addConsole()` onto its
// prototype. The exported const IS the standalone call surface.
//
// The impl routes through `LoggingBuilderExtensions.addProvider` (imported from
// @rhombus-std/logging, which guarantees that package's registration side effects
// ran) rather than touching the registration store directly — exactly the reference
// `AddConsole`, which is `builder.AddProvider(new ConsoleLoggerProvider())` under
// the hood. Only the bare `AddConsole` is ported; the formatter/options variants
// stay deferred with the rest of the advanced console surface.

import { LoggingBuilderExtensions } from "@rhombus-std/logging";
import type { ILoggingBuilder } from "@rhombus-std/logging.core";
import { registerAugmentations } from "@rhombus-std/primitives";
import type { AugmentationSet } from "@rhombus-std/primitives";
import { nameof } from "@rhombus-std/primitives.transformer/internal/nameof";
import { ConsoleLoggerProvider } from "./console-logger-provider";

/**
 * Adds a {@link ConsoleLoggerProvider} to the builder — the mechanical port of
 * `builder.AddProvider(new ConsoleLoggerProvider())`. Returns the builder for
 * chaining.
 */
function addConsole(builder: ILoggingBuilder): ILoggingBuilder {
  LoggingBuilderExtensions.addProvider(builder, new ConsoleLoggerProvider());
  return builder;
}

/**
 * The `ConsoleLoggerExtensions` augmentation set for {@link ILoggingBuilder}
 * (docs §28/§38) — mirrors ME.Logging.Console's `ConsoleLoggerExtensions`.
 * Registered against `nameof<ILoggingBuilder>()` below and reachable
 * as the standalone `ConsoleLoggerExtensions.addConsole(builder)`.
 */
export const ConsoleLoggerExtensions = {
  addConsole,
} satisfies AugmentationSet<ILoggingBuilder>;

// The method form (docs §38): merge onto the owning ILoggingBuilder interface so a
// consumer holding it sees `addConsole`, and onto the concrete LoggingBuilder (whose
// source is recompiled in this program under source-libs) so it still SATISFIES
// `implements ILoggingBuilder`. The class-side merge is retired once logging is
// dist-built (plan section 5).
declare module "@rhombus-std/logging.core" {
  interface ILoggingBuilder {
    /** Instance-method form of {@link addConsole}. */
    addConsole(): this;
  }
}

declare module "@rhombus-std/logging/internal/logging-builder" {
  interface LoggingBuilder {
    addConsole(): this;
  }
}

registerAugmentations(nameof<ILoggingBuilder>(), ConsoleLoggerExtensions);
