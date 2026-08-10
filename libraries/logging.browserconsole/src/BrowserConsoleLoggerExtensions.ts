// BrowserConsoleLoggerExtensions — the browser-console registration surface
// for ILoggingBuilder, mirroring @rhombus-std/logging.console's
// `ConsoleLoggerExtensions.addConsole` shape.
//
// This downstream sink registers its augmentation set against the shared
// `tokenfor<ILoggingBuilder>()` token: the @augment-decorated concrete
// LoggingBuilder pulls the method onto its prototype. The exported const IS
// the standalone call surface.
//
// Idempotent: ONE provider per BUILDER however many addBrowserConsole calls
// run, tracked in a WeakMap keyed by the builder itself (the manifest chain
// is immutable, so the manifest is a different object after each
// registration).

import { LoggingBuilderProviderAugmentations } from '@rhombus-std/logging';
import type { ILoggingBuilder } from '@rhombus-std/logging.core';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import { BrowserConsoleLoggerProvider } from './BrowserConsoleLoggerProvider';

// Keyed by the BUILDER, not by `builder.services`: the manifest chain is
// immutable, so the manifest object changes on every registration and would
// defeat the once-per-configuration-pass dedup this map exists for.
const registrations = new WeakMap<ILoggingBuilder, BrowserConsoleLoggerProvider>();

/**
 * Registered against `tokenfor<ILoggingBuilder>()` below and reachable as
 * the standalone `BrowserConsoleLoggerExtensions.addBrowserConsole(builder)`.
 */
export const BrowserConsoleLoggerExtensions = {
  /**
   * Adds a browser console logger to the builder — one
   * {@link BrowserConsoleLoggerProvider} per builder, writing through the
   * platform console global.
   */
  addBrowserConsole(builder: ILoggingBuilder): ILoggingBuilder {
    let provider = registrations.get(builder);
    if (provider === undefined) {
      provider = new BrowserConsoleLoggerProvider();
      registrations.set(builder, provider);
      LoggingBuilderProviderAugmentations.addProvider(builder, provider);
    }
    return builder;
  },
} satisfies AugmentationSet<ILoggingBuilder>;

// Merges the method onto the owning ILoggingBuilder interface so a consumer
// holding it sees the method. Concrete implementers (logging's
// LoggingBuilder) inherit it through their `interface ... extends
// ILoggingBuilder` merge, so no class-side restatement is needed here.
declare module '@rhombus-std/logging.core' {
  interface ILoggingBuilder {
    /** Instance-method form of {@link BrowserConsoleLoggerExtensions.addBrowserConsole}. */
    addBrowserConsole(): this;
  }
}

registerAugmentations(tokenfor<ILoggingBuilder>(), BrowserConsoleLoggerExtensions);
