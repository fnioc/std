// The builder-targeted listener/rule methods for ITracingBuilder, an OPEN
// receiver whose concrete class lives downstream in @rhombus-std/diagnostics.
// The TracingOptions-targeted mutators of the same names are the sibling
// ./TracingOptions-augmentations set.
//
// addTracingListener constructs and configures the ActivityListenerBuilder
// eagerly and registers it as a value -- there's no tracing infrastructure here
// to lazily resolve against, but the resulting registration is identical for
// any consumer that enumerates the listener builders.

import type { IConfigureOptions } from '@rhombus-std/options';
import { type AugmentationSet2, type Flatten, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';

import { TRACING_CONFIGURE_TOKEN, TRACING_LISTENER_TOKEN } from '../tokens';
import { ActivityListenerBuilder } from './ActivityListenerBuilder';
import { ACTIVITY_SOURCE_SCOPES_ALL, ActivitySourceScopes } from './ActivitySourceScopes';
import type { ITracingBuilder } from './ITracingBuilder';
import { TracingOptions } from './TracingOptions';
import { TracingOptionsAugmentations } from './TracingOptions-augmentations';

interface ITracingBuilderAugmentations {
  /**
   * Registers a tracing listener identified by `name` and described by `configure`.
   * @throws {@link Error} if `name` is empty.
   */
  addTracingListener(name: string, configure: Func<[ActivityListenerBuilder], void>): this;
  /** Removes all {@link ActivityListenerBuilder} registrations from the builder. */
  clearTracingListeners(): this;
  /** Enables activities via a deferred rule. */
  enableTracing(sourceName?: string, operationName?: string, listenerName?: string,
    scopes?: ActivitySourceScopes): this;
  /** Disables activities via a deferred rule. */
  disableTracing(sourceName?: string, operationName?: string, listenerName?: string,
    scopes?: ActivitySourceScopes): this;
}

// The merge targets the package BARREL, not the relative declaring module: the
// downstream config-binding member merges the same interface from
// `@rhombus-std/diagnostics`, and a cross-package merge only reaches a published
// consumer if its specifier survives publish. The barrel is the one
// publish-resolvable specifier both sites can share.
declare module '@rhombus-std/diagnostics.core' {
  interface ITracingBuilder extends ITracingBuilderAugmentations {}
}

/** Registers a `IConfigureOptions<TracingOptions>` step that runs `apply`. */
function configureTracing(builder: ITracingBuilder, apply: Func<[options: TracingOptions], void>): ITracingBuilder {
  const step: IConfigureOptions<TracingOptions> = { configure(options: TracingOptions): void {
    apply(options);
  } };
  builder.services = builder.services.addValue(TRACING_CONFIGURE_TOKEN, step);
  return builder;
}

export const TracingBuilderAugmentations: AugmentationSet2<ITracingBuilder, Flatten<ITracingBuilderAugmentations>> = {
  addTracingListener(builder, name, configure) {
    if (!name) {
      throw new Error('A tracing listener name must be a non-empty string.');
    }
    const listenerBuilder = new ActivityListenerBuilder(name);
    configure(listenerBuilder);
    builder.services = builder.services.addValue(TRACING_LISTENER_TOKEN, listenerBuilder);
    return builder;
  },
  clearTracingListeners(builder) {
    // See the sibling MetricsBuilder-augmentations.ts `clearMetricsListeners`
    // comment: the cast works around a TS structural-comparison depth limit on
    // `Manifest`'s large overload surface, not a real type error.
    builder.services = builder.services.removeAll(TRACING_LISTENER_TOKEN) as typeof builder.services;
    return builder;
  },
  enableTracing(builder, sourceName, operationName, listenerName, scopes = ACTIVITY_SOURCE_SCOPES_ALL) {
    return configureTracing(builder, (options) => {
      TracingOptionsAugmentations.enableTracing(options, sourceName, operationName, listenerName, scopes);
    });
  },
  disableTracing(builder, sourceName, operationName, listenerName, scopes = ACTIVITY_SOURCE_SCOPES_ALL) {
    return configureTracing(builder, (options) => {
      TracingOptionsAugmentations.disableTracing(options, sourceName, operationName, listenerName, scopes);
    });
  },
};

registerAugmentations(tokenfor<ITracingBuilder>(), TracingBuilderAugmentations);
