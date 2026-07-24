// addLogging — the fluent registration entry, ported from ME.Logging's
// `AddLogging(this IServiceCollection, ...)` static method.
//
// Its target, `IServiceCollection`, is @rhombus-std/di.core's `ServiceManifest`
// — a class this package does NOT own, and an OPEN receiver — so it follows the
// augmentation-registry path (docs §38): register the set against the shared
// `tokenfor<IServiceManifest>()` token and declaration-merge the method onto the
// di.core `IServiceManifestBase` interface. The `@augment`-decorated
// `ServiceManifestClass` (in di.core) pulls the member onto its prototype. This is
// why the package sets `"sideEffects": true` — a consumer who only wants the sugar
// writes a bare `import "@rhombus-std/logging";`.
//
// What it registers (the reference AddLogging, now full-parity):
//   - the `IOptions<LoggerFilterOptions>` ASSEMBLY at LOGGER_FILTER_OPTIONS_TOKEN
//     (the reference's `services.AddOptions()` open-generic infrastructure;
//     per-token assembly registration is explicit here);
//   - a default configure step pinning the min level to `Information`
//     (DefaultLoggerLevelConfigureOptions — the reference's default
//     `IConfigureOptions<LoggerFilterOptions>`);
//   - the singleton `ILoggerFactory -> LoggerFactory`, INJECTED with the
//     enumerable provider set and the assembled `IOptions<LoggerFilterOptions>`;
//   - the open `ILogger<$1> -> Logger<$1>` registration (the reference's
//     `Singleton(typeof(ILogger<>), typeof(Logger<>))`), the closing type's
//     token flowing in through `typeArg(1)`;
//   - `configure(new LoggingBuilder(manifest))`.
//
// `addClass`, not TryAdd: di.core registrations are append-only last-wins; there
// is no add-if-absent surface. Re-calling addLogging appends duplicates —
// harmless, last wins (same precedent logging.config's addConfig records).

// Side-effect + merge: installs `addOptions`/`configure` (the options pipeline
// verbs) onto di.core's ServiceManifest, and brings the interface merge that
// types `manifest.addOptions(...)` below into the program.
import '@rhombus-std/options.augmentations';

import { closeToken, type IServiceManifest, type ServiceManifestClass, typeArg } from '@rhombus-std/di.core';
import { type ILoggingBuilder, Logger as LoggerOfT, LogLevel } from '@rhombus-std/logging.core';
import { configureStepToken } from '@rhombus-std/options.augmentations';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { DefaultLoggerLevelConfigureOptions } from './DefaultLoggerLevelConfigureOptions';
import { LoggerFactory } from './LoggerFactory';
import { LoggerFilterOptions } from './LoggerFilterOptions';
import { LoggingBuilder } from './LoggingBuilder';
import { LOGGER_FACTORY_TOKEN, LOGGER_FILTER_OPTIONS_TOKEN, LOGGER_PROVIDER_TOKEN } from './tokens';

// The base of the open `ILogger<$1>` service token — byte-identical to the base
// a transformer consumer's `tokenfor<ILogger<TCategory>>()` derives. Hardcoded
// (not `closeToken(tokenfor<ILogger>(), "$1")`) because `ILogger` is a defaulted
// generic: a BARE `tokenfor<ILogger>()` records the default type argument and
// lowers to `"…:ILogger<unknown>"` (the augmentation-registry key), NOT the
// clean service-token base. An explicit `tokenfor<ILogger<Foo>>()` derives
// `"…:ILogger<pkg:Foo>"` off this same base, so the open template matches. A
// no-transformer consumer writes this literal directly (docs §40); mirrors
// logging.config's `LOGGER_PROVIDER_CONFIGURATION_BASE`.
const ILOGGER_TOKEN_BASE = '@rhombus-std/logging.core:ILogger';

// `addLogging` is a BRAND-NEW method name, so it must merge onto BOTH the
// `IServiceManifestBase` interface (the surface the public `ServiceManifest` type
// resolves to) AND the concrete `ServiceManifestClass`, so the class still
// SATISFIES `implements IServiceManifestBase` once the new name is on the
// interface — exactly as @rhombus-std/options.augmentations does. Type-parameter
// lists MUST match each target's declaration (TS2428): `IServiceManifestBase`
// takes `<Scopes, Provider>`, `ServiceManifestClass` takes `<Scopes>`.
declare module '@rhombus-std/di.core' {
  interface IServiceManifestBase<Scopes extends string = 'singleton', Provider = unknown> {
    /**
     * Registers the logging services and runs the optional {@link ILoggingBuilder}
     * configuration delegate. Returns the manifest produced by every
     * registration -- its own AND whatever the delegate added through the
     * builder's `.services` (the manifest chain is immutable -- never `this`).
     */
    addLogging(configure?: Func<[ILoggingBuilder], void>): IServiceManifest<Scopes>;
  }

  interface ServiceManifestClass<Scopes extends string = 'singleton'> {
    addLogging(configure?: Func<[ILoggingBuilder], void>): IServiceManifest<Scopes>;
  }
}

// One named object literal mirroring the reference's `AddLogging` static class
// (docs §28), registered against the `ServiceManifest` augmentation token
// (docs §38) — the concrete `ServiceManifestClass`, decorated with
// `@augment(tokenfor<IServiceManifest>())` in di.core, pulls the member onto
// its prototype — AND exported so the member is the standalone form.
export const LoggingServiceManifestAugmentations = {
  addLogging(
    manifest: ServiceManifestClass<string>,
    configure?: Func<[ILoggingBuilder], void>,
  ): IServiceManifest<string> {
    // The LoggerFilterOptions assembly + its default (Information) min level.
    let m: IServiceManifest<string> = manifest
      .addOptions<LoggerFilterOptions>(LOGGER_FILTER_OPTIONS_TOKEN, () => new LoggerFilterOptions())
      .as('singleton');
    m = m.addValue(
      configureStepToken(LOGGER_FILTER_OPTIONS_TOKEN),
      new DefaultLoggerLevelConfigureOptions(LogLevel.Information),
    );

    // ILoggerFactory, injected with the enumerable provider set and the
    // assembled IOptions<LoggerFilterOptions>.
    m = m.addClass(
      LOGGER_FACTORY_TOKEN,
      LoggerFactory,
      [[closeToken('Array', LOGGER_PROVIDER_TOKEN), LOGGER_FILTER_OPTIONS_TOKEN]],
      'singleton',
    );

    // The open ILogger<$1> -> Logger<$1> registration: the closing type's token
    // flows in through typeArg(1), from which Logger<T> derives its category.
    m = m.addClass(
      closeToken(ILOGGER_TOKEN_BASE, '$1'),
      LoggerOfT,
      [[LOGGER_FACTORY_TOKEN, typeArg(1)]],
      'singleton',
    );

    // `m` is the widened IServiceManifest<string> (see the declare-module note
    // above), whereas ILoggingBuilder.services is the singleton-default
    // `ServiceManifest` — matching ME, whose logging services are
    // singleton-only. Narrow the scope phantom here: LoggingBuilder merely
    // stores the manifest and never calls the scope-sensitive `build()`, so the
    // phantom is inert.
    //
    // `builder.services` is a MUTABLE field (LoggingBuilder, this package):
    // the `configure` delegate mutates the builder in place the way a
    // no-transformer consumer expects (`builder.addProvider(...).setMinimumLevel(...)`
    // or unchained statement-by-statement), and every builder augmentation
    // reassigns `builder.services` to the manifest its own registration
    // produced — so reading `builder.services` back out AFTER the delegate
    // runs picks up everything it registered.
    const builder = new LoggingBuilder(m as unknown as IServiceManifest);
    configure?.(builder);
    return builder.services as unknown as IServiceManifest<string>;
  },
} satisfies AugmentationSet<ServiceManifestClass<string>>;

registerAugmentations(tokenfor<IServiceManifest>(), LoggingServiceManifestAugmentations);
