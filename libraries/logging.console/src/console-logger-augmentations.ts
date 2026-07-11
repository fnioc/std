// ConsoleLoggerExtensions — the console registration surface for
// ILoggingBuilder, ported from the reference `ConsoleLoggerExtensions`
// (addConsole / addSimpleConsole / addJsonConsole / addSystemdConsole /
// addConsoleFormatter).
//
// ILoggingBuilder is @rhombus-std/logging.core's own interface (an OPEN
// receiver extended across the family), so this downstream sink registers its
// augmentation set against the shared `nameof<ILoggingBuilder>()` token (docs
// §38): the @augment-decorated concrete LoggingBuilder pulls the methods onto
// its prototype. The exported const IS the standalone call surface.
//
// WIRING ADAPTATION. The reference implements these members as DI
// registrations (`TryAddEnumerable` provider/formatter singletons plus
// `IConfigureOptions<T>` delegates materialized when DI constructs the
// provider). That options-DI pipeline doesn't exist here, so the port follows
// this repo's existing wiring — direct construction routed through
// `LoggingBuilderExtensions.addProvider` — with the reference semantics kept:
//   - ONE provider per manifest, however many add* calls run (the
//     `TryAddEnumerable` idempotence), tracked in a WeakMap keyed by
//     `builder.services`.
//   - configure delegates ACCUMULATE: each applies to the shared mutable
//     options object and notifies through a ReloadableOptions, which re-runs
//     the provider's option-reload path — the reference `OnChange` route. One
//     observable divergence: delegates run eagerly at their add* call instead
//     of all-at-once when DI materializes the options.
//   - custom formatters registered BEFORE addConsole are handed to the
//     provider's constructor ahead of the built-ins (first name wins, the
//     reference `TryAdd`); ones registered AFTER reach the already-constructed
//     provider through its `addFormatter` seam — the same visibility the
//     reference gets from DI's lazy construction.
//
// RESIDUAL: the reference `AddConsole` also calls the no-argument
// `AddConfiguration()` and registers the `ILoggerProviderConfiguration<
// ConsoleLoggerProvider>`-driven config binding (`ConsoleLoggerConfigureOptions`,
// `ConsoleFormatterConfigureOptions`, `ConsoleLoggerFormatterConfigureOptions`,
// the formatter change-token sources, and `getFormatterOptionsSection`). That
// provider-configuration factory does not exist in
// @rhombus-std/logging.configuration yet, so none of the config-binding wiring
// is ported — see the package index.

import { LoggingBuilderExtensions } from "@rhombus-std/logging";
import type { ILoggingBuilder } from "@rhombus-std/logging.core";
import { type AugmentationSet, registerAugmentations } from "@rhombus-std/primitives";
import { nameof } from "@rhombus-std/primitives.transformer/internal/nameof";
import type { Func } from "@rhombus-toolkit/func";
import type { ConsoleFormatter } from "./ConsoleFormatter";
import { ConsoleFormatterNames } from "./ConsoleFormatterNames";
import { ConsoleFormatterOptions } from "./ConsoleFormatterOptions";
import { ConsoleLoggerOptions } from "./ConsoleLoggerOptions";
import { ConsoleLoggerProvider } from "./ConsoleLoggerProvider";
import { JsonConsoleFormatter } from "./JsonConsoleFormatter";
import { JsonConsoleFormatterOptions } from "./JsonConsoleFormatterOptions";
import { ReloadableOptions } from "./ReloadableOptions";
import { SimpleConsoleFormatter } from "./SimpleConsoleFormatter";
import { SimpleConsoleFormatterOptions } from "./SimpleConsoleFormatterOptions";
import { SystemdConsoleFormatter } from "./SystemdConsoleFormatter";

/** The per-manifest console registration state (see the module doc). */
interface ConsoleRegistration {
  loggerOptions: ReloadableOptions<ConsoleLoggerOptions>;
  simpleOptions: ReloadableOptions<SimpleConsoleFormatterOptions>;
  systemdOptions: ReloadableOptions<ConsoleFormatterOptions>;
  jsonOptions: ReloadableOptions<JsonConsoleFormatterOptions>;
  /** Custom formatters registered before the provider exists. */
  pendingFormatters: ConsoleFormatter[];
  provider: ConsoleLoggerProvider | undefined;
}

const registrations = new WeakMap<ILoggingBuilder["services"], ConsoleRegistration>();

function getRegistration(builder: ILoggingBuilder): ConsoleRegistration {
  let registration = registrations.get(builder.services);
  if (registration === undefined) {
    registration = {
      loggerOptions: new ReloadableOptions(new ConsoleLoggerOptions()),
      simpleOptions: new ReloadableOptions(new SimpleConsoleFormatterOptions()),
      systemdOptions: new ReloadableOptions(new ConsoleFormatterOptions()),
      jsonOptions: new ReloadableOptions(new JsonConsoleFormatterOptions()),
      pendingFormatters: [],
      provider: undefined,
    };
    registrations.set(builder.services, registration);
  }
  return registration;
}

/** `addConsole` with a formatter pre-selected — the reference private `AddFormatterWithName`. */
function addFormatterWithName(builder: ILoggingBuilder, name: string): ILoggingBuilder {
  return ConsoleLoggerExtensions.addConsole(builder, (options) => {
    options.formatterName = name;
  });
}

/**
 * The `ConsoleLoggerExtensions` augmentation set for {@link ILoggingBuilder}
 * (docs §28/§38) — mirrors the reference `ConsoleLoggerExtensions`.
 * Registered against `nameof<ILoggingBuilder>()` below and reachable as the
 * standalone `ConsoleLoggerExtensions.addConsole(builder)`.
 */
export const ConsoleLoggerExtensions = {
  /**
   * Adds a console logger to the builder — one {@link ConsoleLoggerProvider}
   * per manifest, seeded with the three built-in formatters (plus any custom
   * ones registered via {@link addConsoleFormatter}). The reference's
   * configure-delegate overload collapses into the optional `configure`,
   * which applies to the shared {@link ConsoleLoggerOptions} and re-runs the
   * provider's option-reload path.
   */
  addConsole(builder: ILoggingBuilder, configure?: Func<[ConsoleLoggerOptions], void>): ILoggingBuilder {
    const registration = getRegistration(builder);
    if (registration.provider === undefined) {
      registration.provider = new ConsoleLoggerProvider(registration.loggerOptions, [
        ...registration.pendingFormatters,
        new JsonConsoleFormatter(registration.jsonOptions),
        new SystemdConsoleFormatter(registration.systemdOptions),
        new SimpleConsoleFormatter(registration.simpleOptions),
      ]);
      registration.pendingFormatters.length = 0;
      LoggingBuilderExtensions.addProvider(builder, registration.provider);
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
  addSimpleConsole(
    builder: ILoggingBuilder,
    configure?: Func<[SimpleConsoleFormatterOptions], void>,
  ): ILoggingBuilder {
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
  addJsonConsole(
    builder: ILoggingBuilder,
    configure?: Func<[JsonConsoleFormatterOptions], void>,
  ): ILoggingBuilder {
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
  addSystemdConsole(
    builder: ILoggingBuilder,
    configure?: Func<[ConsoleFormatterOptions], void>,
  ): ILoggingBuilder {
    addFormatterWithName(builder, ConsoleFormatterNames.systemd);
    if (configure !== undefined) {
      getRegistration(builder).systemdOptions.reload(configure);
    }
    return builder;
  },

  /**
   * Adds a custom console formatter, selectable by its name through
   * {@link ConsoleLoggerOptions.formatterName}. The reference's type-driven
   * `AddConsoleFormatter<TFormatter, TOptions>` relies on DI constructing the
   * formatter with its options; the explicit (no-transformer-first) form
   * takes the constructed instance — the caller owns the formatter's options,
   * so the configure-delegate overload collapses into constructing it
   * configured.
   */
  addConsoleFormatter(builder: ILoggingBuilder, formatter: ConsoleFormatter): ILoggingBuilder {
    const registration = getRegistration(builder);
    if (registration.provider === undefined) {
      registration.pendingFormatters.push(formatter);
    } else {
      registration.provider.addFormatter(formatter);
    }
    return builder;
  },
} satisfies AugmentationSet<ILoggingBuilder>;

// The method form (docs §38): merge onto the owning ILoggingBuilder interface so a
// consumer holding it sees the methods, and onto the concrete LoggingBuilder (whose
// source is recompiled in this program under source-libs) so it still SATISFIES
// `implements ILoggingBuilder`. The class-side merge is retired once logging is
// dist-built (plan section 5).
declare module "@rhombus-std/logging.core" {
  interface ILoggingBuilder {
    /** Instance-method form of {@link ConsoleLoggerExtensions.addConsole}. */
    addConsole(configure?: Func<[ConsoleLoggerOptions], void>): this;
    /** Instance-method form of {@link ConsoleLoggerExtensions.addSimpleConsole}. */
    addSimpleConsole(configure?: Func<[SimpleConsoleFormatterOptions], void>): this;
    /** Instance-method form of {@link ConsoleLoggerExtensions.addJsonConsole}. */
    addJsonConsole(configure?: Func<[JsonConsoleFormatterOptions], void>): this;
    /** Instance-method form of {@link ConsoleLoggerExtensions.addSystemdConsole}. */
    addSystemdConsole(configure?: Func<[ConsoleFormatterOptions], void>): this;
    /** Instance-method form of {@link ConsoleLoggerExtensions.addConsoleFormatter}. */
    addConsoleFormatter(formatter: ConsoleFormatter): this;
  }
}

declare module "@rhombus-std/logging/internal/LoggingBuilder" {
  interface LoggingBuilder {
    addConsole(configure?: Func<[ConsoleLoggerOptions], void>): this;
    addSimpleConsole(configure?: Func<[SimpleConsoleFormatterOptions], void>): this;
    addJsonConsole(configure?: Func<[JsonConsoleFormatterOptions], void>): this;
    addSystemdConsole(configure?: Func<[ConsoleFormatterOptions], void>): this;
    addConsoleFormatter(formatter: ConsoleFormatter): this;
  }
}

registerAugmentations(nameof<ILoggingBuilder>(), ConsoleLoggerExtensions);
