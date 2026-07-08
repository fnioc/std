// Ported from MED.Tracing's `TracingBuilderExtensions.{Listeners,Rules}`.
// Authored as object literals per ME class (docs §28), `satisfies
// AugmentationSet<R>`.
//
// The ITracingBuilder-receiver methods ship as `TracingBuilderExtensions`; the
// concrete `TracingBuilder` lives downstream in @rhombus-std/diagnostics, which
// installs the method form (cross-package rule). The value-object receiver
// methods ship as `TracingOptionsExtensions` and are installed onto the concrete
// `TracingOptions` here (its owning package).
//
// The reference AddListener registers a factory that lazily builds+configures an
// ActivityListenerBuilder when the tracing infrastructure first resolves; with no
// tracing infrastructure here the builder is constructed and configured eagerly
// and registered as a value -- the resulting registration is identical for any
// consumer that enumerates the listener builders. The IServiceProvider-receiving
// AddListener overload is not ported (no listener runtime consumes it -- see the
// package tbd notes).

import type { ConfigureOptions } from "@rhombus-std/options";
import { applyAugmentations } from "@rhombus-std/primitives";
import type { AugmentationSet } from "@rhombus-std/primitives";
import type { Func } from "@rhombus-toolkit/func";

import { ActivityListenerBuilder } from "./activity-listener-builder";
import { ACTIVITY_SOURCE_SCOPES_ALL, ActivitySourceScopes } from "./activity-source-scopes";
import { TRACING_CONFIGURE_TOKEN, TRACING_LISTENER_TOKEN } from "./tokens";
import type { ITracingBuilder } from "./tracing-builder";
import { TracingOptions } from "./tracing-options";
import { TracingRule } from "./tracing-rule";

/**
 * Registers a tracing listener identified by `name` and described by `configure`.
 * Mirrors `TracingBuilderExtensions.AddListener(ITracingBuilder, string, Action<ActivityListenerBuilder>)`.
 * @throws {@link Error} if `name` is empty.
 */
function addTracingListener(
  builder: ITracingBuilder,
  name: string,
  configure: Func<[ActivityListenerBuilder], void>,
): ITracingBuilder {
  if (!name) {
    throw new Error("A tracing listener name must be a non-empty string.");
  }
  const listenerBuilder = new ActivityListenerBuilder(name);
  configure(listenerBuilder);
  builder.services.addValue(TRACING_LISTENER_TOKEN, listenerBuilder);
  return builder;
}

/**
 * Appends an ENABLE {@link TracingRule} directly to a {@link TracingOptions}.
 * Mirrors `TracingOptions.EnableTracing(...)`.
 */
function enableTracingRule(
  options: TracingOptions,
  sourceName?: string,
  operationName?: string,
  listenerName?: string,
  scopes: ActivitySourceScopes = ACTIVITY_SOURCE_SCOPES_ALL,
): TracingOptions {
  options.rules.push(new TracingRule(sourceName, operationName, listenerName, scopes, true));
  return options;
}

/**
 * Appends a DISABLE {@link TracingRule} directly to a {@link TracingOptions}.
 * Mirrors `TracingOptions.DisableTracing(...)`.
 */
function disableTracingRule(
  options: TracingOptions,
  sourceName?: string,
  operationName?: string,
  listenerName?: string,
  scopes: ActivitySourceScopes = ACTIVITY_SOURCE_SCOPES_ALL,
): TracingOptions {
  options.rules.push(new TracingRule(sourceName, operationName, listenerName, scopes, false));
  return options;
}

/** Registers a `ConfigureOptions<TracingOptions>` step that runs `apply`. */
function configureTracing(builder: ITracingBuilder, apply: (options: TracingOptions) => void): ITracingBuilder {
  const step: ConfigureOptions<TracingOptions> = {
    configure(options: TracingOptions): void {
      apply(options);
    },
  };
  builder.services.addValue(TRACING_CONFIGURE_TOKEN, step);
  return builder;
}

/**
 * Enables activities via a deferred rule. Mirrors
 * `TracingBuilderExtensions.EnableTracing(ITracingBuilder, ...)`.
 */
function enableTracing(
  builder: ITracingBuilder,
  sourceName?: string,
  operationName?: string,
  listenerName?: string,
  scopes: ActivitySourceScopes = ACTIVITY_SOURCE_SCOPES_ALL,
): ITracingBuilder {
  return configureTracing(builder, (options) => {
    enableTracingRule(options, sourceName, operationName, listenerName, scopes);
  });
}

/**
 * Disables activities via a deferred rule. Mirrors
 * `TracingBuilderExtensions.DisableTracing(ITracingBuilder, ...)`.
 */
function disableTracing(
  builder: ITracingBuilder,
  sourceName?: string,
  operationName?: string,
  listenerName?: string,
  scopes: ActivitySourceScopes = ACTIVITY_SOURCE_SCOPES_ALL,
): ITracingBuilder {
  return configureTracing(builder, (options) => {
    disableTracingRule(options, sourceName, operationName, listenerName, scopes);
  });
}

/**
 * The `TracingBuilderExtensions` augmentation set for {@link ITracingBuilder}
 * (docs §28) -- the builder-targeted listener/rule methods. Installed onto the
 * concrete builder downstream in `@rhombus-std/diagnostics`.
 */
export const TracingBuilderExtensions = {
  addTracingListener,
  enableTracing,
  disableTracing,
} satisfies AugmentationSet<ITracingBuilder>;

// The value-object method form (docs §28). Merge onto the concrete
// `TracingOptions` (its own package owns the class, so the install lives here) so
// `tracingOptions.enableTracing(...)` reads as fluently as the standalone
// `TracingOptionsExtensions.enableTracing(options, ...)`.
declare module "./tracing-options" {
  interface TracingOptions {
    enableTracing(
      sourceName?: string,
      operationName?: string,
      listenerName?: string,
      scopes?: ActivitySourceScopes,
    ): this;
    disableTracing(
      sourceName?: string,
      operationName?: string,
      listenerName?: string,
      scopes?: ActivitySourceScopes,
    ): this;
  }
}

/**
 * The `TracingOptions`-targeted rule mutators (docs §28). ME names these
 * value-object receiver methods `EnableTracing`/`DisableTracing` (the same names
 * as the builder overloads, distinguished only by receiver), so the members drop
 * the `Rule` suffix; the private `enableTracingRule`/`disableTracingRule` helpers
 * back both the builder's deferred forms and these direct member forms. Installed
 * as prototype methods onto the concrete `TracingOptions` (the primary path) AND
 * exported so the members are the standalone form.
 */
export const TracingOptionsExtensions = {
  enableTracing: enableTracingRule,
  disableTracing: disableTracingRule,
} satisfies AugmentationSet<TracingOptions>;

applyAugmentations(TracingOptions, TracingOptionsExtensions);
