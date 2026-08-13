// `addLogging` registers the logging services onto a manifest and runs the
// optional `ILoggingBuilder` configure delegate.
//
// Its target, `IServiceCollection`, is @rhombus-std/di.core's `ServiceManifest`
// — a class this package does NOT own — so it follows the augmentation-registry
// path: register the set against the shared `typefor<Manifest>()`
// token and declaration-merge the method onto di.core's `Manifest`
// interface; the `@augment`-decorated `DefaultManifest` (in di.core) pulls
// the member onto its prototype. This is why the package sets
// `"sideEffects": true` — a consumer who only wants the sugar writes a bare
// `import "@rhombus-std/logging";`.
//
// What it registers:
//   - the `IOptions<LoggerFilterOptions>` assembly at LOGGER_FILTER_OPTIONS_TYPE;
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
import { configureStepType } from '@rhombus-std/options.augmentations';
import { type AugmentationSet2, registerAugmentations, Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { DefaultLoggerLevelConfigureOptions } from './DefaultLoggerLevelConfigureOptions';
import { LoggerFactory } from './LoggerFactory';
import { LoggerFilterOptions } from './LoggerFilterOptions';
import { LoggingBuilder } from './LoggingBuilder';
import { LOGGER_FACTORY_TYPE, LOGGER_FILTER_OPTIONS_TYPE, LOGGER_PROVIDER_TYPE } from './types';

type IManifestLoggingAugmentations<Scopes extends string> = {
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
  interface Manifest<Scopes extends string = any> extends IManifestLoggingAugmentations<Scopes> {}
}

// Registered against the `ServiceManifest` augmentation token — the concrete
// `DefaultManifest`, decorated with `@augment(typefor<Manifest>())`
// in di.core, pulls the member onto its prototype — and exported so the member
// is also the standalone call form.
export const ServiceManifestLoggingAugmentations: AugmentationSet2<DefaultManifest<string>,
  IManifestLoggingAugmentations<string>> = {
    addLogging(configure) {
      // The LoggerFilterOptions assembly + its default (Information) min level.
      let m: Manifest<string> = this.addOptions<LoggerFilterOptions>(LOGGER_FILTER_OPTIONS_TYPE,
        () => new LoggerFilterOptions());
      m = m.addValue(configureStepType(LOGGER_FILTER_OPTIONS_TYPE),
        new DefaultLoggerLevelConfigureOptions(LogLevel.Information));

      // ILoggerFactory, injected with the enumerable provider set and the
      // assembled IOptions<LoggerFilterOptions>.
      m = m.addClass(LOGGER_FACTORY_TYPE, LoggerFactory, [[
        Type.array(LOGGER_PROVIDER_TYPE),
        LOGGER_FILTER_OPTIONS_TYPE,
      ]], 'singleton');

      // The open ILogger<$1> -> Logger<$1> registration: the closing type flows
      // in through the `$1` placeholder, from which Logger<T> derives its category.
      //
      // The base is written out rather than derived, because `ILogger` is a
      // defaulted generic: a bare `typefor<ILogger>()` records the default type
      // argument and yields `ILogger<unknown>`, not the clean open base. An
      // explicit `typefor<ILogger<Foo>>()` derives off this same base, so the
      // template matches.
      const hole = Type.placeholder('$1');
      m = m.addClass(Type.named('ILogger', '@rhombus-std/logging.core', [hole]), LoggerOfT, [[LOGGER_FACTORY_TYPE,
        hole]], 'singleton');

      // `m` is the widened Manifest<string>, whereas
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

registerAugmentations(typefor<Manifest>(), ServiceManifestLoggingAugmentations);
