// addLogging — the fluent registration entry, ported from ME.Logging's
// `LoggingServiceCollectionExtensions.AddLogging(this IServiceCollection, ...)`.
//
// Its target, `IServiceCollection`, is @rhombus-std/di.core's `ServiceManifest`
// — a class this package does NOT own — so it follows the config.json-style
// declaration-merging side-effect augmentation: prototype-patch
// `ServiceManifestClass` and declaration-merge the method onto the di.core
// `ServiceManifestBase` interface, exactly as di.core's authoring.ts documents.
// This is why the package sets `"sideEffects": true` — a consumer who only wants
// the sugar writes a bare `import "@rhombus-std/logging";`.
//
// Faithfulness vs. the reference AddLogging, given providers + the options DI
// integration are out of scope (issue #75):
//   - Registers a singleton ILoggerFactory -> LoggerFactory. (`add`, not TryAdd:
//     di.core registrations are append-only last-wins; there is no add-if-absent
//     surface. Re-calling addLogging appends a second — harmless, last wins.)
//   - Runs `configure(new LoggingBuilder(manifest))`.
//   - OMITTED: `AddOptions()`, the open `ILogger<> -> Logger<>` registration
//     (needs runtime type-name reflection TS lacks), and the default
//     `IConfigureOptions<LoggerFilterOptions>` (needs the deferred options DI
//     integration). Documented in the README.

import { ServiceManifestClass } from "@rhombus-std/di.core";
import type { ServiceManifest } from "@rhombus-std/di.core";
import type { ILoggingBuilder } from "@rhombus-std/logging.core";
import { applyExtensions, defineExtensions } from "@rhombus-std/primitives";
import type { Func } from "@rhombus-toolkit/func";
import { LoggerFactory } from "./logger-factory";
import { LoggingBuilder } from "./logging-builder";
import { LOGGER_FACTORY_TOKEN } from "./tokens";

// `addLogging` is a BRAND-NEW method name, so it must merge onto BOTH the
// `ServiceManifestBase` interface (the surface the public `ServiceManifest` type
// resolves to) AND the concrete `ServiceManifestClass`, so the class still
// SATISFIES `implements ServiceManifestBase` once the new name is on the
// interface — exactly as @rhombus-std/options.augmentations does. Type-parameter
// lists MUST match each target's declaration (TS2428): `ServiceManifestBase`
// takes `<Scopes, Provider>`, `ServiceManifestClass` takes `<Scopes>`.
declare module "@rhombus-std/di.core" {
  interface ServiceManifestBase<Scopes extends string = "singleton", Provider = unknown> {
    /**
     * Registers the logging services and runs the optional {@link ILoggingBuilder}
     * configuration delegate. Returns `this` for chaining.
     */
    addLogging(configure?: Func<[ILoggingBuilder], void>): this;
  }

  interface ServiceManifestClass<Scopes extends string = "singleton"> {
    addLogging(configure?: Func<[ILoggingBuilder], void>): this;
  }
}

// Dual-export (docs §22): authored once as a receiver-first function, installed
// as a prototype method (the primary path) via applyExtensions AND exported
// standalone (the fallback / testing surface).
export const loggingExtensions = defineExtensions<ServiceManifestClass<string>>()({
  addLogging(
    manifest: ServiceManifestClass<string>,
    configure?: Func<[ILoggingBuilder], void>,
  ): ServiceManifestClass<string> {
    manifest.add(LOGGER_FACTORY_TOKEN, LoggerFactory).as("singleton");
    // `manifest` is the widened ServiceManifestClass<string> (see the
    // declare-module note above), whereas ILoggingBuilder.services is the
    // singleton-default `ServiceManifest` — matching ME, whose logging services
    // are singleton-only. Narrow the scope phantom here: LoggingBuilder merely
    // stores the manifest and never calls the scope-sensitive `build()`, so the
    // phantom is inert.
    configure?.(new LoggingBuilder(manifest as unknown as ServiceManifest));
    return manifest;
  },
});

applyExtensions(ServiceManifestClass, loggingExtensions);
