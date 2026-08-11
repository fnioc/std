// `addLogging` registers the logging services onto a manifest and runs the
// optional `ILoggingBuilder` configure delegate.
//
// Its target, `IServiceCollection`, is @rhombus-std/di.core's `ServiceManifest`
// — a class this package does NOT own — so it follows the augmentation-registry
// path: register the set against the shared `tokenfor<IServiceManifest>()`
// token and declaration-merge the method onto di.core's `IServiceManifestBase`
// interface; the `@augment`-decorated `ServiceManifestClass` (in di.core) pulls
// the member onto its prototype. This is why the package sets
// `"sideEffects": true` — a consumer who only wants the sugar writes a bare
// `import "@rhombus-std/logging";`.
//
// What it registers:
//   - the `IOptions<LoggerFilterOptions>` assembly at LOGGER_FILTER_OPTIONS_TOKEN;
//   - a default configure step pinning the min level to `Information`;
//   - the singleton `ILoggerFactory -> LoggerFactory`, injected with the
//     enumerable provider set and the assembled `IOptions<LoggerFilterOptions>`;
//   - the open `ILogger<$1> -> Logger<$1>` registration, the closing type's
//     token flowing in through `typeArg(1)`;
//   - `configure(new LoggingBuilder(manifest))`.
//
// `addClass`, not TryAdd: di.core registrations are append-only last-wins; there
// is no add-if-absent surface. Re-calling addLogging appends duplicates —
// harmless, last wins.

// Side-effect + merge: installs `addOptions`/`configure` (the options pipeline
// verbs) onto di.core's ServiceManifest, and brings the interface merge that
// types `manifest.addOptions(...)` below into the program.
import '@rhombus-std/options.augmentations';

import type { DefaultManifest, Manifest } from '@rhombus-std/di.core';
import { type ILoggingBuilder, Logger as LoggerOfT, LogLevel } from '@rhombus-std/logging.core';
import { configureStepToken } from '@rhombus-std/options.augmentations';
import { type AugmentationSet2, type NamedType, registerAugmentations, Type } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { DefaultLoggerLevelConfigureOptions } from './DefaultLoggerLevelConfigureOptions';
import { LoggerFactory } from './LoggerFactory';
import { LoggerFilterOptions } from './LoggerFilterOptions';
import { LoggingBuilder } from './LoggingBuilder';
import { LOGGER_FACTORY_TOKEN, LOGGER_FILTER_OPTIONS_TOKEN, LOGGER_PROVIDER_TOKEN } from './tokens';

// The base of the open `ILogger<$1>` service token. Hardcoded (not
// `closeToken(tokenfor<ILogger>(), "$1")`) because `ILogger` is a defaulted
// generic: a bare `tokenfor<ILogger>()` records the default type argument and
// produces `"…:ILogger<unknown>"`, not the clean service-token base. An
// explicit `tokenfor<ILogger<Foo>>()` derives `"…:ILogger<pkg:Foo>"` off this
// same base, so the open template matches. Mirrors logging.config's
// `LOGGER_PROVIDER_CONFIGURATION_BASE`.
const ILOGGER_TOKEN_BASE = '@rhombus-std/logging.core:ILogger';

type IServiceManifestLoggingAugmentations<Scopes extends string> = {
  /**
   * Registers the logging services and runs the optional {@link ILoggingBuilder}
   * configuration delegate. Returns the manifest produced by every
   * registration -- its own AND whatever the delegate added through the
   * builder's `.services` (the manifest chain is immutable -- never `this`).
   */
  addLogging(configure?: Func<[ILoggingBuilder], void>): Manifest<Scopes>;
};

// `Provider` is defaulted so the merge's type-parameter list matches the
// target's (TS2428 requires identical parameters), even though the member does
// not name it.
declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string = any> extends IServiceManifestLoggingAugmentations<Scopes> {}
}

// Registered against the `ServiceManifest` augmentation token — the concrete
// `ServiceManifestClass`, decorated with `@augment(tokenfor<IServiceManifest>())`
// in di.core, pulls the member onto its prototype — and exported so the member
// is also the standalone call form.
export const ServiceManifestLoggingAugmentations: AugmentationSet2<DefaultManifest<string>,
  IServiceManifestLoggingAugmentations<string>> = {
    addLogging(manifest, configure) {
      // The LoggerFilterOptions assembly + its default (Information) min level.
      let m: Manifest<string> = manifest.addOptions<LoggerFilterOptions>(LOGGER_FILTER_OPTIONS_TOKEN,
        () => new LoggerFilterOptions());
      m = m.addValue(configureStepToken(LOGGER_FILTER_OPTIONS_TOKEN),
        new DefaultLoggerLevelConfigureOptions(LogLevel.Information));

      // ILoggerFactory, injected with the enumerable provider set and the
      // assembled IOptions<LoggerFilterOptions>.
      m = m.addClass(LOGGER_FACTORY_TOKEN, LoggerFactory, [[
        Type.named('Array', 'global', [Type.from(LOGGER_PROVIDER_TOKEN)]),
        LOGGER_FILTER_OPTIONS_TOKEN,
      ]], 'singleton');

      // The open ILogger<$1> -> Logger<$1> registration: the closing type flows
      // in through the `$1` placeholder, from which Logger<T> derives its category.
      const iLoggerBase = Type.from(ILOGGER_TOKEN_BASE) as NamedType;
      const hole = Type.placeholder('$1');
      m = m.addClass(Type.named(iLoggerBase.name, iLoggerBase.from, [hole]), LoggerOfT, [[LOGGER_FACTORY_TOKEN, hole]],
        'singleton');

      // `m` is the widened IServiceManifest<string>, whereas
      // ILoggingBuilder.services is the singleton-default `ServiceManifest` --
      // logging services are singleton-only. Narrow the scope phantom here:
      // LoggingBuilder merely stores the manifest and never calls the
      // scope-sensitive `build()`, so the phantom is inert.
      //
      // `builder.services` is a MUTABLE field (LoggingBuilder, this package): the
      // `configure` delegate mutates the builder in place
      // (`builder.addProvider(...).setMinimumLevel(...)` or unchained
      // statement-by-statement), and every builder augmentation reassigns
      // `builder.services` to the manifest its own registration produced -- so
      // reading `builder.services` back out AFTER the delegate runs picks up
      // everything it registered.
      const builder = new LoggingBuilder(m as unknown as Manifest);
      configure?.(builder);
      return builder.services as unknown as Manifest<string>;
    },
  };

registerAugmentations(tokenfor<Manifest>(), ServiceManifestLoggingAugmentations);
