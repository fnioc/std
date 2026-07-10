// TracingBuilderExtensions / TracingOptionsExtensions -- ported from MED.Tracing's
// `TracingBuilderExtensions.{Listeners,Rules}`.
//
// The builder-targeted members target the family's OWN interface (ITracingBuilder);
// the options-targeted members target the concrete value object TracingOptions. Both
// groups are dual-export augmentations (docs §28): a named object literal installed
// onto the receiver's prototype AND reachable as `Set.member(receiver, …)`. ITracingBuilder
// is an OPEN receiver whose concrete class lives downstream (@rhombus-std/diagnostics'
// TracingBuilder), so its literal self-registers here against the `ITracingBuilder` token
// (docs §38); the concrete builder is decorated `@augment(token)` and pulls the bag onto
// its prototype. The TracingOptions literal is a CLOSED set installed in-package (the
// concrete class lives here) via direct applyAugmentations in ./options-augmentations.
//
// The reference AddListener registers a factory that lazily builds+configures an
// ActivityListenerBuilder when the tracing infrastructure first resolves; with no
// tracing infrastructure here the builder is constructed and configured eagerly and
// registered as a value -- the resulting registration is identical for any consumer
// that enumerates the listener builders. The IServiceProvider-receiving AddListener
// overload is not ported (no listener runtime consumes it -- see the package tbd notes).
//
// EnableTracing/DisableTracing, like their metrics counterparts, split into a
// builder-targeted and a TracingOptions-targeted overload that ME names identically,
// distinguished only by receiver. Both are ported as `enableTracing`/`disableTracing`
// members of the two literals; the former `*Rule` suffix (a free-function-clash
// workaround) is dropped now that #115 gives each its own literal (#105).

import type { ConfigureOptions } from "@rhombus-std/options";
import { type AugmentationSet, registerAugmentations } from "@rhombus-std/primitives";
import type { Func } from "@rhombus-toolkit/func";

import { nameof } from "@rhombus-std/primitives.transformer/internal/nameof";
import { TRACING_CONFIGURE_TOKEN, TRACING_LISTENER_TOKEN } from "../tokens";
import { ACTIVITY_SOURCE_SCOPES_ALL, ActivitySourceScopes } from "./activity-source-scopes";
import { ActivityListenerBuilder } from "./ActivityListenerBuilder";
import type { ITracingBuilder } from "./ITracingBuilder";
import { TracingOptions } from "./TracingOptions";
import { TracingRule } from "./TracingRule";

/**
 * The `TracingOptions`-targeted rule mutators (docs §28) -- the value-object overloads
 * of `TracingBuilderExtensions.{Enable,Disable}Tracing`, which ME names identically to
 * their builder counterparts, distinguished only by `this` receiver. Installed onto
 * `TracingOptions.prototype` in ./options-augmentations.
 */
export const TracingOptionsExtensions = {
  /**
   * Appends an ENABLE {@link TracingRule} directly to a {@link TracingOptions}.
   * Mirrors `TracingOptions.EnableTracing(...)`.
   */
  enableTracing(
    options: TracingOptions,
    sourceName?: string,
    operationName?: string,
    listenerName?: string,
    scopes: ActivitySourceScopes = ACTIVITY_SOURCE_SCOPES_ALL,
  ): TracingOptions {
    options.rules.push(new TracingRule(sourceName, operationName, listenerName, scopes, true));
    return options;
  },
  /**
   * Appends a DISABLE {@link TracingRule} directly to a {@link TracingOptions}.
   * Mirrors `TracingOptions.DisableTracing(...)`.
   */
  disableTracing(
    options: TracingOptions,
    sourceName?: string,
    operationName?: string,
    listenerName?: string,
    scopes: ActivitySourceScopes = ACTIVITY_SOURCE_SCOPES_ALL,
  ): TracingOptions {
    options.rules.push(new TracingRule(sourceName, operationName, listenerName, scopes, false));
    return options;
  },
} satisfies AugmentationSet<TracingOptions>;

/** Registers a `ConfigureOptions<TracingOptions>` step that runs `apply`. */
function configureTracing(builder: ITracingBuilder, apply: Func<[options: TracingOptions], void>): ITracingBuilder {
  const step: ConfigureOptions<TracingOptions> = {
    configure(options: TracingOptions): void {
      apply(options);
    },
  };
  builder.services.addValue(TRACING_CONFIGURE_TOKEN, step);
  return builder;
}

/**
 * The `TracingBuilderExtensions` augmentation set for {@link ITracingBuilder}
 * (docs §28) -- the builder-targeted listener/rule methods. Installed onto the
 * concrete builder downstream in `@rhombus-std/diagnostics`.
 */
export const TracingBuilderExtensions = {
  /**
   * Registers a tracing listener identified by `name` and described by `configure`.
   * Mirrors `TracingBuilderExtensions.AddListener(ITracingBuilder, string, Action<ActivityListenerBuilder>)`.
   * @throws {@link Error} if `name` is empty.
   */
  addTracingListener(
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
  },
  /**
   * Enables activities via a deferred rule. Mirrors
   * `TracingBuilderExtensions.EnableTracing(ITracingBuilder, ...)`.
   */
  enableTracing(
    builder: ITracingBuilder,
    sourceName?: string,
    operationName?: string,
    listenerName?: string,
    scopes: ActivitySourceScopes = ACTIVITY_SOURCE_SCOPES_ALL,
  ): ITracingBuilder {
    return configureTracing(builder, (options) => {
      TracingOptionsExtensions.enableTracing(options, sourceName, operationName, listenerName, scopes);
    });
  },
  /**
   * Disables activities via a deferred rule. Mirrors
   * `TracingBuilderExtensions.DisableTracing(ITracingBuilder, ...)`.
   */
  disableTracing(
    builder: ITracingBuilder,
    sourceName?: string,
    operationName?: string,
    listenerName?: string,
    scopes: ActivitySourceScopes = ACTIVITY_SOURCE_SCOPES_ALL,
  ): ITracingBuilder {
    return configureTracing(builder, (options) => {
      TracingOptionsExtensions.disableTracing(options, sourceName, operationName, listenerName, scopes);
    });
  },
} satisfies AugmentationSet<ITracingBuilder>;

// Self-registration for the OPEN `ITracingBuilder` receiver (docs §38). The
// interface-side declaration merge lives here beside the const (rule §38.6); the
// class-side merge for the concrete `TracingBuilder` stays downstream next to the
// class (@rhombus-std/diagnostics' builder-augmentations). That class is decorated
// `@augment(the `ITracingBuilder` token)`, so this registration reaches its
// prototype.
declare module "./ITracingBuilder" {
  interface ITracingBuilder {
    addTracingListener(name: string, configure: Func<[ActivityListenerBuilder], void>): this;
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

registerAugmentations(nameof<ITracingBuilder>(), TracingBuilderExtensions);
