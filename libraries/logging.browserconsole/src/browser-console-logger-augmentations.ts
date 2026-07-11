// BrowserConsoleLoggerExtensions — the browser-console registration surface
// for ILoggingBuilder, mirroring @rhombus-std/logging.console's
// `ConsoleLoggerExtensions.addConsole` shape (there is no reference-stack
// analog: the browser sink is native to this port).
//
// ILoggingBuilder is @rhombus-std/logging.core's own interface (an OPEN
// receiver extended across the family), so this downstream sink registers its
// augmentation set against the shared `nameof<ILoggingBuilder>()` token (docs
// §38): the @augment-decorated concrete LoggingBuilder pulls the method onto
// its prototype. The exported const IS the standalone call surface.
//
// Idempotence mirrors the console sink's `TryAddEnumerable` semantics: ONE
// provider per manifest however many addBrowserConsole calls run, tracked in a
// WeakMap keyed by `builder.services`.

import { LoggingBuilderExtensions } from '@rhombus-std/logging';
import type { ILoggingBuilder } from '@rhombus-std/logging.core';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives.transformer/internal/nameof';
import { BrowserConsoleLoggerProvider } from './BrowserConsoleLoggerProvider';

const registrations = new WeakMap<ILoggingBuilder['services'], BrowserConsoleLoggerProvider>();

/**
 * The `BrowserConsoleLoggerExtensions` augmentation set for
 * {@link ILoggingBuilder} (docs §28/§38). Registered against
 * `nameof<ILoggingBuilder>()` below and reachable as the standalone
 * `BrowserConsoleLoggerExtensions.addBrowserConsole(builder)`.
 */
export const BrowserConsoleLoggerExtensions = {
  /**
   * Adds a browser console logger to the builder — one
   * {@link BrowserConsoleLoggerProvider} per manifest, writing through the
   * platform console global.
   */
  addBrowserConsole(builder: ILoggingBuilder): ILoggingBuilder {
    let provider = registrations.get(builder.services);
    if (provider === undefined) {
      provider = new BrowserConsoleLoggerProvider();
      registrations.set(builder.services, provider);
      LoggingBuilderExtensions.addProvider(builder, provider);
    }
    return builder;
  },
} satisfies AugmentationSet<ILoggingBuilder>;

// The method form (docs §38): merge onto the owning ILoggingBuilder interface so a
// consumer holding it sees the method. Concrete implementers (logging's
// LoggingBuilder) inherit it through their `interface ... extends ILoggingBuilder`
// merge, so no class-side restatement is needed here.
declare module '@rhombus-std/logging.core' {
  interface ILoggingBuilder {
    /** Instance-method form of {@link BrowserConsoleLoggerExtensions.addBrowserConsole}. */
    addBrowserConsole(): this;
  }
}

registerAugmentations(nameof<ILoggingBuilder>(), BrowserConsoleLoggerExtensions);
