// BrowserConsoleLoggerAugmentations — the browser-console registration surface
// for ILoggingBuilder, mirroring @rhombus-std/logging.console's
// `ConsoleLoggerAugmentations.addConsole` shape.
//
// This downstream sink registers its augmentation set against the shared
// `typefor<ILoggingBuilder>()` token: the @augment-decorated concrete
// LoggingBuilder pulls the method onto its prototype. The exported const IS
// the standalone call surface.
//
// Idempotent: ONE provider per BUILDER however many addBrowserConsole calls
// run, tracked in a WeakMap keyed by the builder itself (the manifest chain
// is immutable, so the manifest is a different object after each
// registration).

import { LoggingBuilderProviderAugmentations } from '@rhombus-std/logging';
import type { ILoggingBuilder } from '@rhombus-std/logging.core';
import { type AugmentationSet2, type Flatten, registerAugmentations } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import { BrowserConsoleLoggerProvider } from './BrowserConsoleLoggerProvider';

// Keyed by the BUILDER, not by `builder.services`: the manifest chain is
// immutable, so the manifest object changes on every registration and would
// defeat the once-per-configuration-pass dedup this map exists for.
const registrations = new WeakMap<ILoggingBuilder, BrowserConsoleLoggerProvider>();

/**
 * Registered against `typefor<ILoggingBuilder>()` below and reachable as
 * the standalone `BrowserConsoleLoggerAugmentations.addBrowserConsole(builder)`.
 */
interface ILoggingBuilderBrowserConsoleAugmentations {
  /** Adds a browser-console logger provider to the builder. */
  addBrowserConsole(): this;
}

// Merges the method onto the owning ILoggingBuilder interface so a consumer
// holding it sees the method. Concrete implementers (logging's LoggingBuilder)
// inherit it through their `interface ... extends ILoggingBuilder` merge, so no
// class-side restatement is needed here.
declare module '@rhombus-std/logging.core' {
  interface ILoggingBuilder extends ILoggingBuilderBrowserConsoleAugmentations {}
}

export const BrowserConsoleLoggerAugmentations: AugmentationSet2<ILoggingBuilder,
  Flatten<ILoggingBuilderBrowserConsoleAugmentations>> = {
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
  };

registerAugmentations(typefor<ILoggingBuilder>(), BrowserConsoleLoggerAugmentations);
