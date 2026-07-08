// Public entry point for @rhombus-std/diagnostics -- the ME.Diagnostics (impl)
// analog.
//
// Ships the concrete MetricsBuilder/TracingBuilder, the config-binding extension
// functions (addMetricsConfiguration/addTracingConfiguration), the config-bind
// ConfigureOptions steps, and -- as a SIDE EFFECT of importing this module --
// installs the `addMetrics`/`addTracing` fluent authoring methods onto di.core's
// registration builder AND the metrics/tracing builder extensions as instance
// methods on the family's own builders (both via the dual-export convention,
// docs §22: every extension available as a standalone function AND a method).
//
// `addMetrics`/`addTracing` target di.core's ServiceManifestClass -- a class this
// package does NOT own -- so per §0 they are extension-method augmentations: TS
// declaration merging + a runtime prototype assignment, exactly how
// @rhombus-std/options.augmentations adds `addOptions`/`configure` and
// @rhombus-std/config.json adds `addJsonFile`. A consumer who only wants the
// sugar takes a bare side-effect import: `import "@rhombus-std/diagnostics";`.
// This package MUST keep `"sideEffects": true` so a bundler cannot tree-shake the
// augmentation away.
//
// The reference AddMetrics/AddTracing register a listener/subscription RUNTIME
// (DefaultMeterFactory, MetricsSubscriptionManager, DefaultActivitySourceFactory,
// the NoOpOptions/SubscriptionActivator startup hooks) -- none of which has an
// analog here (no Meter/Instrument/Activity/ActivitySource runtime). What is
// mechanical and meaningful is registering the resolvable `Options<MetricsOptions>`
// / `Options<TracingOptions>` assembly (so a consumer can resolve the assembled,
// config-reactive rule set) and running the consumer's configure callback over a
// concrete builder. See the package tbd notes for what the missing runtime would add.

// `Func`, `IMetricsBuilder`/`ITracingBuilder` are named imports (not member
// references inside the augmentation block) because unqualified names in a
// `declare module` body resolve in THIS file's scope.
import { RESOLVER_TOKEN, ServiceManifestClass } from "@rhombus-std/di.core";
import type { IMetricsBuilder, ITracingBuilder } from "@rhombus-std/diagnostics.core";
import {
  METRICS_CHANGE_TOKEN_SOURCE_TOKEN,
  METRICS_CONFIGURE_TOKEN,
  METRICS_OPTIONS_TOKEN,
  MetricsOptions,
  TRACING_CHANGE_TOKEN_SOURCE_TOKEN,
  TRACING_CONFIGURE_TOKEN,
  TRACING_OPTIONS_TOKEN,
  TracingOptions,
} from "@rhombus-std/diagnostics.core";
import { applyExtensions, defineExtensions } from "@rhombus-std/primitives";
import type { Func } from "@rhombus-toolkit/func";

import { assembleDiagnosticsOptions } from "./assemble-diagnostics-options";
// Side-effect: installs the metrics/tracing builder extensions as instance
// methods onto MetricsBuilder/TracingBuilder (the reverse-direction half of the
// dual-export convention). Their standalone free-function form ships separately.
import "./builder-augmentations";
import { MetricsBuilder } from "./metrics-builder";
import { TracingBuilder } from "./tracing-builder";

// The authored methods merge onto core's `ServiceManifestBase` interface -- the
// surface the public `ServiceManifest` a consumer holds resolves to -- AND onto
// the concrete `ServiceManifestClass`, so the class still SATISFIES `implements
// ServiceManifestBase` once these NEW method names are on the interface.
// `Provider`/`Scopes` are defaulted so each merge matches its target's
// type-parameter list (TS2428 requires identical parameters).
declare module "@rhombus-std/di.core" {
  interface ServiceManifestBase<Scopes extends string = "singleton", Provider = unknown> {
    /**
     * Registers the metrics options assembly and, if `configure` is supplied,
     * runs it over a concrete {@link IMetricsBuilder}. After this call resolving
     * {@link METRICS_OPTIONS_TOKEN} yields an `Options<MetricsOptions>` assembled
     * from every rule / config-bind step registered through the builder, reactive
     * to configuration reloads. Mirrors `MetricsServiceExtensions.AddMetrics`
     * (the listener/subscription runtime it also wires has no analog here).
     */
    addMetrics(configure?: Func<[IMetricsBuilder], void>): this;
    /**
     * Registers the tracing options assembly and, if `configure` is supplied,
     * runs it over a concrete {@link ITracingBuilder}. After this call resolving
     * {@link TRACING_OPTIONS_TOKEN} yields an `Options<TracingOptions>` assembled
     * from every rule / config-bind step registered through the builder, reactive
     * to configuration reloads. Mirrors `TracingServiceExtensions.AddTracing`.
     */
    addTracing(configure?: Func<[ITracingBuilder], void>): this;
  }

  interface ServiceManifestClass<Scopes extends string = "singleton"> {
    addMetrics(configure?: Func<[IMetricsBuilder], void>): this;
    addTracing(configure?: Func<[ITracingBuilder], void>): this;
  }
}

// Authored once as receiver-first functions, installed as prototype methods (the
// primary path) via applyExtensions AND exported standalone (the fallback /
// testing surface) -- the dual-export convention (docs §22).
export const diagnosticsExtensions = defineExtensions<ServiceManifestClass<string>>()({
  addMetrics(
    manifest: ServiceManifestClass<string>,
    configure?: Func<[IMetricsBuilder], void>,
  ): ServiceManifestClass<string> {
    // Register the resolvable `Options<MetricsOptions>` assembly at singleton
    // scope. Calling addMetrics twice re-registers the (identical) factory --
    // last-wins bare-token resolution keeps that correct; the reference guards it
    // with TryAdd, a `has`/`try*` surface di.core does not expose (options.augmentations'
    // addOptions has the same benign behavior). The factory takes the live
    // provider view via a RESOLVER_TOKEN slot, exactly like assembleOptions.
    manifest.addFactory(
      METRICS_OPTIONS_TOKEN,
      (resolver) =>
        assembleDiagnosticsOptions(
          resolver,
          METRICS_CONFIGURE_TOKEN,
          METRICS_CHANGE_TOKEN_SOURCE_TOKEN,
          () => new MetricsOptions(),
        ),
      [[RESOLVER_TOKEN]],
    ).as("singleton");
    if (configure) {
      configure(new MetricsBuilder(manifest));
    }
    return manifest;
  },
  addTracing(
    manifest: ServiceManifestClass<string>,
    configure?: Func<[ITracingBuilder], void>,
  ): ServiceManifestClass<string> {
    manifest.addFactory(
      TRACING_OPTIONS_TOKEN,
      (resolver) =>
        assembleDiagnosticsOptions(
          resolver,
          TRACING_CONFIGURE_TOKEN,
          TRACING_CHANGE_TOKEN_SOURCE_TOKEN,
          () => new TracingOptions(),
        ),
      [[RESOLVER_TOKEN]],
    ).as("singleton");
    if (configure) {
      configure(new TracingBuilder(manifest));
    }
    return manifest;
  },
});

applyExtensions(ServiceManifestClass, diagnosticsExtensions);

// The concrete builders (mirrors the reference private MetricsBuilder/TracingBuilder,
// exported here so a no-augmentation consumer can construct one directly).
export { MetricsBuilder } from "./metrics-builder";
export { TracingBuilder } from "./tracing-builder";

// The config-binding extension functions. Their receiver is the family's OWN
// builder interface, so the standalone free-function is the authored form; the
// dual-export convention (docs §22) additionally installs them as instance
// methods on MetricsBuilder/TracingBuilder via ./builder-augmentations, so both
// `addMetricsConfiguration(builder, cfg)` and `builder.addMetricsConfiguration(cfg)`
// work. Both forms stay available; the method form is the primary path.
export { addMetricsConfiguration } from "./metrics-builder-configuration-extensions";
export { addTracingConfiguration } from "./tracing-builder-configuration-extensions";

// The config-bind ConfigureOptions steps (the reference's internal
// Metrics/TracingConfigureOptions), exposed so a plugin-less consumer can bind a
// configuration section without the addMetricsConfiguration wrapper.
export { MetricsConfigureOptions } from "./metrics-configure-options";
export { TracingConfigureOptions } from "./tracing-configure-options";
