// addLogging — the fluent registration entry, ported from ME.Logging's
// `LoggingServiceCollectionExtensions.AddLogging(this IServiceCollection, ...)`.
//
// Its target, `IServiceCollection`, is @rhombus-std/di.core's `ServiceManifest`
// — a class this package does NOT own, and an OPEN receiver — so it follows the
// augmentation-registry path (docs §38): register the set against the shared
// `nameof<ServiceManifest>()` token and declaration-merge the method onto the
// di.core `ServiceManifestBase` interface. The `@augment`-decorated
// `ServiceManifestClass` (in di.core) pulls the member onto its prototype. This is
// why the package sets `"sideEffects": true` — a consumer who only wants the sugar
// writes a bare `import "@rhombus-std/logging";`.
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

// `nameof<ServiceManifest>()` derives the BARE token
// (`@rhombus-std/di.core:ServiceManifest`) for a bare reference to the
// defaulted-generic alias — alias-wins derivation records no type arguments
// (primitives.transformer `genericTypeArguments`, decision 5) — so it agrees
// exactly with the token the `@augment`-decorated ServiceManifestClass
// subscribes to in di.core.
import type { ServiceManifest, ServiceManifestClass } from "@rhombus-std/di.core";
import type { ILoggingBuilder } from "@rhombus-std/logging.core";
import { type AugmentationSet, registerAugmentations } from "@rhombus-std/primitives";
import { nameof } from "@rhombus-std/primitives.transformer/internal/nameof";
import type { Func } from "@rhombus-toolkit/func";
import { LoggerFactory } from "./LoggerFactory";
import { LoggingBuilder } from "./LoggingBuilder";
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

// One named object literal mirroring the reference `LoggingServiceCollectionExtensions`
// static class (docs §28), registered against the `ServiceManifest` augmentation
// token (docs §38) — the concrete `ServiceManifestClass`, decorated with
// `@augment(nameof<ServiceManifest>())` in di.core, pulls the member onto
// its prototype — AND exported so the member is the standalone form.
export const LoggingServiceCollectionExtensions = {
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
} satisfies AugmentationSet<ServiceManifestClass<string>>;

registerAugmentations(nameof<ServiceManifest>(), LoggingServiceCollectionExtensions);
