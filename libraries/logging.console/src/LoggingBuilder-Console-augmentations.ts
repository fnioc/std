// Console registration surface for ILoggingBuilder: addConsole /
// addSimpleConsole / addJsonConsole / addSystemdConsole / addConsoleFormatter.
//
// ILoggingBuilder is @rhombus-std/logging.core's own interface (an OPEN
// receiver extended across the family), so this downstream sink registers its
// augmentation set against the shared `tokenfor<ILoggingBuilder>()` token: the
// @augment-decorated concrete LoggingBuilder pulls the methods onto its
// prototype. The exported const IS the standalone call surface.
//
//   - ONE provider per BUILDER, however many add* calls run, tracked in a
//     WeakMap keyed by the builder itself -- the manifest chain is immutable,
//     so `builder.services` is a different object after each registration and
//     would defeat the dedup.
//   - configure delegates ACCUMULATE: each applies to the shared mutable
//     options object and notifies through a ReloadableOptions, which re-runs
//     the provider's option-reload path. Delegates run eagerly at their add*
//     call.
//   - custom formatters registered BEFORE addConsole are handed to the
//     provider's constructor ahead of the built-ins (first name wins); ones
//     registered AFTER reach the already-constructed provider through its
//     `addFormatter` seam.
//
// Config-tree-driven provider configuration (binding a config section to
// ConsoleLoggerOptions/formatter options) isn't wired up yet — see the
// package index.

import { LoggingBuilderProviderAugmentations } from '@rhombus-std/logging';
import type { ILoggingBuilder } from '@rhombus-std/logging.core';
import { type AugmentationSet2, type Flatten, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import type { ConsoleFormatter } from './ConsoleFormatter';
import { ConsoleFormatterNames } from './ConsoleFormatterNames';
import { ConsoleFormatterOptions } from './ConsoleFormatterOptions';
import { ConsoleLoggerOptions } from './ConsoleLoggerOptions';
import { ConsoleLoggerProvider } from './ConsoleLoggerProvider';
import { JsonConsoleFormatter } from './JsonConsoleFormatter';
import { JsonConsoleFormatterOptions } from './JsonConsoleFormatterOptions';
import { ReloadableOptions } from './ReloadableOptions';
import { SimpleConsoleFormatter } from './SimpleConsoleFormatter';
import { SimpleConsoleFormatterOptions } from './SimpleConsoleFormatterOptions';
import { SystemdConsoleFormatter } from './SystemdConsoleFormatter';

/** The per-builder console registration state (see the module doc). */
interface ConsoleRegistration {
  loggerOptions: ReloadableOptions<ConsoleLoggerOptions>;
  simpleOptions: ReloadableOptions<SimpleConsoleFormatterOptions>;
  systemdOptions: ReloadableOptions<ConsoleFormatterOptions>;
  jsonOptions: ReloadableOptions<JsonConsoleFormatterOptions>;
  /** Custom formatters registered before the provider exists. */
  pendingFormatters: ConsoleFormatter[];
  provider: ConsoleLoggerProvider | undefined;
}

// Keyed by the BUILDER, not by `builder.services`. The manifest chain is
// immutable, so `builder.services` is a DIFFERENT object after every
// registration -- keying on it would hand each `addConsole` a fresh state bag
// and register a second provider.
const registrations = new WeakMap<ILoggingBuilder, ConsoleRegistration>();

function getRegistration(builder: ILoggingBuilder): ConsoleRegistration {
  let registration = registrations.get(builder);
  if (registration === undefined) {
    registration = { loggerOptions: new ReloadableOptions(new ConsoleLoggerOptions()),
      simpleOptions: new ReloadableOptions(new SimpleConsoleFormatterOptions()),
      systemdOptions: new ReloadableOptions(new ConsoleFormatterOptions()),
      jsonOptions: new ReloadableOptions(new JsonConsoleFormatterOptions()), pendingFormatters: [],
      provider: undefined };
    registrations.set(builder, registration);
  }
  return registration;
}

/** `addConsole` with a formatter pre-selected. */
function addFormatterWithName(builder: ILoggingBuilder, name: string): ILoggingBuilder {
  return ConsoleLoggerAugmentations.addConsole(builder, (options) => {
    options.formatterName = name;
  });
}

interface ILoggingBuilderConsoleAugmentations {
  /**
   * Adds a console logger to the builder — one {@link ConsoleLoggerProvider}
   * per builder, seeded with the three built-in formatters (plus any custom
   * ones registered via {@link addConsoleFormatter}). The optional `configure`
   * applies to the shared {@link ConsoleLoggerOptions} and re-runs the
   * provider's option-reload path.
   */
  addConsole(configure?: Func<[ConsoleLoggerOptions], void>): this;
  addSimpleConsole(configure?: Func<[SimpleConsoleFormatterOptions], void>): this;
  addJsonConsole(configure?: Func<[JsonConsoleFormatterOptions], void>): this;
  addSystemdConsole(configure?: Func<[ConsoleFormatterOptions], void>): this;
  addConsoleFormatter(formatter: ConsoleFormatter): this;
}

// Merges onto the owning ILoggingBuilder interface so a consumer holding it
// sees the methods. Concrete implementers (logging's LoggingBuilder) inherit
// these through their `interface ... extends ILoggingBuilder` merge, so no
// class-side restatement is needed here.
declare module '@rhombus-std/logging.core' {
  interface ILoggingBuilder extends ILoggingBuilderConsoleAugmentations {}
}

/**
 * Registered against `tokenfor<ILoggingBuilder>()` below and reachable as the
 * standalone `ConsoleLoggerAugmentations.addConsole(builder)`.
 */
export const ConsoleLoggerAugmentations: AugmentationSet2<ILoggingBuilder,
  Flatten<ILoggingBuilderConsoleAugmentations>> = {
    addConsole(builder, configure) {
      const registration = getRegistration(builder);
      if (registration.provider === undefined) {
        registration.provider = new ConsoleLoggerProvider(registration.loggerOptions, [
          ...registration.pendingFormatters,
          new JsonConsoleFormatter(registration.jsonOptions),
          new SystemdConsoleFormatter(registration.systemdOptions),
          new SimpleConsoleFormatter(registration.simpleOptions),
        ]);
        registration.pendingFormatters.length = 0;
        LoggingBuilderProviderAugmentations.addProvider(builder, registration.provider);
      }
      if (configure !== undefined) {
        registration.loggerOptions.reload(configure);
      }
      return builder;
    },

    /**
     * Adds the default console log formatter named `"simple"` — optionally
     * configuring its {@link SimpleConsoleFormatterOptions}.
     */
    addSimpleConsole(builder, configure) {
      addFormatterWithName(builder, ConsoleFormatterNames.simple);
      if (configure !== undefined) {
        getRegistration(builder).simpleOptions.reload(configure);
      }
      return builder;
    },

    /**
     * Adds the console log formatter named `"json"` — optionally configuring
     * its {@link JsonConsoleFormatterOptions}.
     */
    addJsonConsole(builder, configure) {
      addFormatterWithName(builder, ConsoleFormatterNames.json);
      if (configure !== undefined) {
        getRegistration(builder).jsonOptions.reload(configure);
      }
      return builder;
    },

    /**
     * Adds the console log formatter named `"systemd"` — optionally configuring
     * its {@link ConsoleFormatterOptions}.
     */
    addSystemdConsole(builder, configure) {
      addFormatterWithName(builder, ConsoleFormatterNames.systemd);
      if (configure !== undefined) {
        getRegistration(builder).systemdOptions.reload(configure);
      }
      return builder;
    },

    /**
     * Adds a custom console formatter, selectable by its name through
     * {@link ConsoleLoggerOptions.formatterName}. Takes the constructed
     * instance — the caller owns the formatter's options, so configuring it
     * happens at construction.
     */
    addConsoleFormatter(builder, formatter) {
      const registration = getRegistration(builder);
      if (registration.provider === undefined) {
        registration.pendingFormatters.push(formatter);
      } else {
        registration.provider.addFormatter(formatter);
      }
      return builder;
    },
  };

registerAugmentations(tokenfor<ILoggingBuilder>(), ConsoleLoggerAugmentations);
