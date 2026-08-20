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
//   - the LoggerFilterOptions pipeline, offered at typefor<LoggerFilterOptions>();
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
import { ILoggerFactory, ILoggerProvider, type ILoggingBuilder, Logger as LoggerOfT, LogLevel } from '@rhombus-std/logging.core';
import { type IConfigureOptions, IOptions } from '@rhombus-std/options';
import { Type } from '@rhombus-std/primitives';
import { registerAugmentations, typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { DefaultLoggerLevelConfigureOptions } from './DefaultLoggerLevelConfigureOptions';
import { LoggerFactory } from './LoggerFactory';
import { LoggerFilterOptions } from './LoggerFilterOptions';
import { LoggingBuilder } from './LoggingBuilder';
// import type { ILoggerFactory, ILoggerProvider } from '@rhombus-std/logging.core';

// Registered against the `ServiceManifest` augmentation token — the concrete
// `DefaultManifest`, decorated with `@augment(typefor<Manifest>())`
// in di.core, pulls the member onto its prototype — and exported so the member
// is also the standalone call form.
export namespace ServiceManifestLoggingAugmentations {
  /**
   * Registers the logging services and runs the optional {@link ILoggingBuilder}
   * configuration delegate. Returns the manifest produced by every
   * registration -- its own AND whatever the delegate added through the
   * builder's `.services` (the manifest chain is immutable -- never `this`).
   */
  export function addLogging(this: Manifest<string>, configure?: Func<[ILoggingBuilder], void>): Manifest<string> {
    // The LoggerFilterOptions assembly + its default (Information) min level.
    let m: Manifest<string> = this.addOptions(typefor<LoggerFilterOptions>(), () => new LoggerFilterOptions());
    m = m.addValue<IConfigureOptions<LoggerFilterOptions>>(new DefaultLoggerLevelConfigureOptions(LogLevel.Information));

    // ILoggerFactory, injected with the enumerable provider set and the
    // assembled IOptions<LoggerFilterOptions>.
    m = m.add(typefor<ILoggerFactory>(), LoggerFactory, Type.ctor(typefor<ILoggerFactory>(), [[Type.array(typefor<ILoggerProvider>()), typefor<IOptions<LoggerFilterOptions>>()]]), 'singleton');

    // The open ILogger<$1> -> Logger<$1> registration: the closing type flows
    // in through the `$1` placeholder, from which Logger<T> derives its category.
    //
    // The base is written out rather than derived, because `ILogger` is a
    // defaulted generic: a bare `typefor<ILogger>()` records the default type
    // argument and yields `ILogger<unknown>`, not the clean open base. An
    // explicit `typefor<ILogger<Foo>>()` derives off this same base, so the
    // template matches.
    const hole = Type.generic('$1');
    const openLoggerType = Type.imported('ILogger', '@rhombus-std/logging.core', [hole]);
    m = m.add(openLoggerType, LoggerOfT, Type.ctor(openLoggerType, [[typefor<ILoggerFactory>(), hole]]), 'singleton');

    // `builder.services` is a MUTABLE field (LoggingBuilder, this package): the
    // `configure` delegate mutates the builder in place
    // (`builder.addProvider(...).setMinimumLevel(...)` or unchained
    // statement-by-statement), and every builder augmentation reassigns
    // `builder.services` to the manifest its own registration produced -- so
    // reading `builder.services` back out AFTER the delegate runs picks up
    // everything it registered.
    const builder = new LoggingBuilder(m);
    configure?.(builder);
    return builder.services;
  }
}

// `Scopes` is defaulted so the merge's type-parameter list matches every other
// partial declaration of `Manifest` (TS2428 requires identical parameters).
declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> {
    addLogging(configure?: Func<[ILoggingBuilder], void>): Manifest<Scopes>;
  }
}

registerAugmentations<Manifest<any>>(ServiceManifestLoggingAugmentations);
