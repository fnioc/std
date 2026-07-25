// TracingBuilderExtensions / TracingOptionsExtensions -- the builder-targeted
// listener/rule methods (installed onto ITracingBuilder, an OPEN receiver whose
// concrete class lives downstream) and the TracingOptions-targeted rule mutators
// (a CLOSED set installed in-package via ./options-augmentations). Both groups
// are dual-export augmentations: a named object literal installed onto the
// receiver's prototype AND reachable as `Set.member(receiver, …)`. The two
// groups share the same member names (enableTracing/disableTracing),
// distinguished only by which receiver they're installed on.
//
// addTracingListener constructs and configures the ActivityListenerBuilder
// eagerly and registers it as a value -- there's no tracing infrastructure here
// to lazily resolve against, but the resulting registration is identical for
// any consumer that enumerates the listener builders.

import type { IConfigureOptions } from '@rhombus-std/options';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';

import { tokenfor } from '@rhombus-std/primitives.extras';
import { TRACING_CONFIGURE_TOKEN, TRACING_LISTENER_TOKEN } from '../tokens';
import { ActivityListenerBuilder } from './ActivityListenerBuilder';
import { ACTIVITY_SOURCE_SCOPES_ALL, ActivitySourceScopes } from './ActivitySourceScopes';
import type { ITracingBuilder } from './ITracingBuilder';
import { TracingOptions } from './TracingOptions';
import { TracingRule } from './TracingRule';

/**
 * The `TracingOptions`-targeted rule mutators, installed onto
 * `TracingOptions.prototype` in ./options-augmentations.
 */
export const TracingOptionsExtensions = {
  /** Appends an ENABLE {@link TracingRule} directly to a {@link TracingOptions}. */
  enableTracing(options: TracingOptions, sourceName?: string, operationName?: string, listenerName?: string,
    scopes: ActivitySourceScopes = ACTIVITY_SOURCE_SCOPES_ALL): TracingOptions
  {
    options.rules.push(new TracingRule(sourceName, operationName, listenerName, scopes, true));
    return options;
  },
  /** Appends a DISABLE {@link TracingRule} directly to a {@link TracingOptions}. */
  disableTracing(options: TracingOptions, sourceName?: string, operationName?: string, listenerName?: string,
    scopes: ActivitySourceScopes = ACTIVITY_SOURCE_SCOPES_ALL): TracingOptions
  {
    options.rules.push(new TracingRule(sourceName, operationName, listenerName, scopes, false));
    return options;
  },
} satisfies AugmentationSet<TracingOptions>;

/** Registers a `IConfigureOptions<TracingOptions>` step that runs `apply`. */
function configureTracing(builder: ITracingBuilder, apply: Func<[options: TracingOptions], void>): ITracingBuilder {
  const step: IConfigureOptions<TracingOptions> = { configure(options: TracingOptions): void {
    apply(options);
  } };
  builder.services = builder.services.addValue(TRACING_CONFIGURE_TOKEN, step);
  return builder;
}

/**
 * The builder-targeted listener/rule methods for {@link ITracingBuilder},
 * installed onto the concrete builder downstream in `@rhombus-std/diagnostics`.
 */
export const TracingBuilderExtensions = {
  /**
   * Registers a tracing listener identified by `name` and described by `configure`.
   * @throws {@link Error} if `name` is empty.
   */
  addTracingListener(builder: ITracingBuilder, name: string,
    configure: Func<[ActivityListenerBuilder], void>): ITracingBuilder
  {
    if (!name) {
      throw new Error('A tracing listener name must be a non-empty string.');
    }
    const listenerBuilder = new ActivityListenerBuilder(name);
    configure(listenerBuilder);
    builder.services = builder.services.addValue(TRACING_LISTENER_TOKEN, listenerBuilder);
    return builder;
  },
  /**
   * Removes all {@link ActivityListenerBuilder} registrations from the builder,
   * via di.core's `removeAll` descriptor verb, installed as a manifest method
   * through the augmentation registry.
   */
  clearTracingListeners(builder: ITracingBuilder): ITracingBuilder {
    // See the sibling metrics-builder-augmentations.ts `clearMetricsListeners`
    // comment: the cast works around a TS structural-comparison depth limit on
    // `IServiceManifestBase`'s large overload surface, not a real type error.
    builder.services = builder.services.removeAll(TRACING_LISTENER_TOKEN) as typeof builder.services;
    return builder;
  },
  /** Enables activities via a deferred rule. */
  enableTracing(builder: ITracingBuilder, sourceName?: string, operationName?: string, listenerName?: string,
    scopes: ActivitySourceScopes = ACTIVITY_SOURCE_SCOPES_ALL): ITracingBuilder
  {
    return configureTracing(builder, (options) => {
      TracingOptionsExtensions.enableTracing(options, sourceName, operationName, listenerName, scopes);
    });
  },
  /** Disables activities via a deferred rule. */
  disableTracing(builder: ITracingBuilder, sourceName?: string, operationName?: string, listenerName?: string,
    scopes: ActivitySourceScopes = ACTIVITY_SOURCE_SCOPES_ALL): ITracingBuilder
  {
    return configureTracing(builder, (options) => {
      TracingOptionsExtensions.disableTracing(options, sourceName, operationName, listenerName, scopes);
    });
  },
} satisfies AugmentationSet<ITracingBuilder>;

// Self-registration for the OPEN `ITracingBuilder` receiver. The interface-side
// declaration merge lives here beside the const; the class-side merge for the
// concrete `TracingBuilder` stays downstream next to the class
// (@rhombus-std/diagnostics' builder-augmentations). That class is decorated
// `@augment(the ITracingBuilder token)`, so this registration reaches its
// prototype.
//
// The merge targets the package BARREL (`@rhombus-std/diagnostics.core`), not the
// relative declaring module: the downstream config-binding member merges the
// same interface from `@rhombus-std/diagnostics`, and a cross-package merge only
// reaches a published consumer if its specifier survives publish. The barrel is
// the one publish-resolvable specifier both sites can share, so both flip here.
declare module '@rhombus-std/diagnostics.core' {
  interface ITracingBuilder {
    addTracingListener(name: string, configure: Func<[ActivityListenerBuilder], void>): this;
    clearTracingListeners(): this;
    enableTracing(sourceName?: string, operationName?: string, listenerName?: string,
      scopes?: ActivitySourceScopes): this;
    disableTracing(sourceName?: string, operationName?: string, listenerName?: string,
      scopes?: ActivitySourceScopes): this;
  }
}

registerAugmentations(tokenfor<ITracingBuilder>(), TracingBuilderExtensions);
