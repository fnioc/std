// The builder-targeted listener/rule methods for ITracingBuilder, an OPEN
// receiver whose concrete class lives downstream in @rhombus-std/diagnostics.
// The TracingOptions-targeted mutators of the same names are the sibling
// ./TracingOptions-augmentations set.
//
// addTracingListener constructs and configures the ActivityListenerBuilder
// eagerly and registers it as a value -- there's no tracing infrastructure here
// to lazily resolve against, but the resulting registration is identical for
// any consumer that enumerates the listener builders.

import { ConstantType } from '@rhombus-std/di.core';
import type { IConfigureOptions } from '@rhombus-std/options';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import type { Flatten } from '@rhombus-toolkit/type-helpers';

import { TRACING_CONFIGURE_TYPE, TRACING_LISTENER_TYPE } from '../types';
import { ActivityListenerBuilder } from './ActivityListenerBuilder';
import { ACTIVITY_SOURCE_SCOPES_ALL, ActivitySourceScopes } from './ActivitySourceScopes';
import type { ITracingBuilder } from './ITracingBuilder';
import { TracingOptions } from './TracingOptions';
import { TracingOptionsAugmentations } from './TracingOptions-augmentations';

/** Registers a `IConfigureOptions<TracingOptions>` step that runs `apply`. */
function configureTracing(builder: ITracingBuilder, apply: Func<[options: TracingOptions], void>): ITracingBuilder {
  const step: IConfigureOptions<TracingOptions> = { configure(options: TracingOptions): void {
    apply(options);
  } };
  builder.services = builder.services.add(TRACING_CONFIGURE_TYPE, step, ConstantType);
  return builder;
}

export namespace TracingBuilderAugmentations {
  /**
   * Registers a tracing listener identified by `name` and described by `configure`.
   * @throws {@link Error} if `name` is empty.
   */
  export function addTracingListener<Self extends ITracingBuilder>(this: Self, name: string, configure: Func<[ActivityListenerBuilder], void>): Self {
    if (!name) {
      throw new Error('A tracing listener name must be a non-empty string.');
    }
    const listenerBuilder = new ActivityListenerBuilder(name);
    configure(listenerBuilder);
    this.services = this.services.add(TRACING_LISTENER_TYPE, listenerBuilder, ConstantType);
    return this;
  }

  /** Removes all {@link ActivityListenerBuilder} registrations from the builder. */
  export function clearTracingListeners<Self extends ITracingBuilder>(this: Self): Self {
    // See the sibling MetricsBuilder-augmentations.ts `clearMetricsListeners`
    // comment: the cast works around a TS structural-comparison depth limit on
    // `Manifest`'s large overload surface, not a real type error.
    this.services = this.services.removeAll(TRACING_LISTENER_TYPE) as typeof this.services;
    return this;
  }

  /** Enables activities via a deferred rule. */
  export function enableTracing<Self extends ITracingBuilder>(this: Self, sourceName?: string, operationName?: string, listenerName?: string,
    scopes: ActivitySourceScopes = ACTIVITY_SOURCE_SCOPES_ALL): Self {
    return configureTracing(this, (options) => {
      TracingOptionsAugmentations.enableTracing.call(options, sourceName, operationName, listenerName, scopes);
    }) as Self;
  }

  /** Disables activities via a deferred rule. */
  export function disableTracing<Self extends ITracingBuilder>(this: Self, sourceName?: string, operationName?: string, listenerName?: string,
    scopes: ActivitySourceScopes = ACTIVITY_SOURCE_SCOPES_ALL): Self {
    return configureTracing(this, (options) => {
      TracingOptionsAugmentations.disableTracing.call(options, sourceName, operationName, listenerName, scopes);
    }) as Self;
  }
}

// The merge targets the package BARREL, not the relative declaring module: the
// downstream config-binding member merges the same interface from
// `@rhombus-std/diagnostics`, and a cross-package merge only reaches a published
// consumer if its specifier survives publish. The barrel is the one
// publish-resolvable specifier both sites can share.
declare module '@rhombus-std/diagnostics.core' {
  interface ITracingBuilder extends Flatten<typeof TracingBuilderAugmentations> {}
}

registerAugmentations<ITracingBuilder>(TracingBuilderAugmentations);
