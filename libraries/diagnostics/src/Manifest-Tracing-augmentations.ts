// `addTracing` registers the tracing options assembly onto di.core's `Manifest`
// and, if a configure delegate is supplied, runs it over a concrete
// {@link ITracingBuilder}.
//
// `Manifest` is not a class this package owns, so this follows the
// augmentation-registry path: register the set against the shared
// `typefor<Manifest>()` type and declaration-merge the method onto di.core's
// `Manifest` interface; the `@augment`-decorated `DefaultManifest` (in
// di.core) pulls the member onto its prototype.

// `Func`, `ITracingBuilder`, `IServiceProvider`, `Manifest` are named imports
// (not member references inside the augmentation block) because unqualified
// names in a `declare module` body resolve in THIS file's scope.
import { type IServiceProvider, type Manifest } from '@rhombus-std/di.core';
import { collectionType, type ITracingBuilder, TracingOptions } from '@rhombus-std/diagnostics.core';
import type { IConfigureOptions, IOptions } from '@rhombus-std/options';
import type { IOptionsChangeTokenSource } from '@rhombus-std/options.augmentations';
import { Type } from '@rhombus-std/primitives';
import { registerAugmentations, typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { assembleDiagnosticsOptions } from './assemble-diagnostics-options';
import type { ActivityListenerConfigFactory } from './tracing/config/ActivityListenerConfigFactory';
import { DefaultActivityListenerConfigFactory } from './tracing/config/DefaultActivityListenerConfigFactory';
import type { TracingConfig } from './tracing/config/TracingConfig';
import { TracingBuilder } from './tracing/TracingBuilder';

export namespace ServiceManifestTracingAugmentations {
  /**
   * Registers the tracing options assembly and, if `configure` is supplied,
   * runs it over a concrete {@link ITracingBuilder}. After this call resolving
   * `IOptions<TracingOptions>` yields the assembly built
   * from every rule / config-bind step registered through the builder, reactive
   * to configuration reloads.
   */
  export function addTracing(this: Manifest<unknown>, configure?: Func<[ITracingBuilder], void>): Manifest<unknown> {
    let m: Manifest<unknown> = this.add(typefor<IOptions<TracingOptions>>(),
      (resolver) => assembleDiagnosticsOptions(resolver, typefor<IConfigureOptions<TracingOptions>>(), typefor<IOptionsChangeTokenSource<TracingOptions>>(), () => new TracingOptions()),
      Type.func(typefor<IOptions<TracingOptions>>(), [[typefor<IServiceProvider>()]]), 'singleton');
    // The per-listener configuration factory, ctor-injected with the collection
    // of every TracingConfig marker addTracingConfig registered.
    m = m.add(typefor<ActivityListenerConfigFactory>(), DefaultActivityListenerConfigFactory, Type.ctor(typefor<ActivityListenerConfigFactory>(), [[collectionType(typefor<TracingConfig>())]]),
      'singleton');
    if (configure) {
      // See the addMetrics cast above for why this is needed.
      const builder = new TracingBuilder(m);
      configure(builder);
      // Immutable chain -- read back what the builder registered (see addMetrics).
      m = builder.services;
    }
    return m;
  }
}

// `Lifetime` is defaulted so the merge matches its target's type-parameter list
// (TS2428 requires identical parameters).
declare module '@rhombus-std/di.core' {
  interface Manifest<Lifetime> {
    addTracing(configure?: Func<[ITracingBuilder], void>): Manifest<Lifetime>;
  }
}

// OPEN receiver: register against di.core's `Manifest` type. The
// `DefaultManifest` decorated `@augment(typefor<Manifest>())` in di.core pulls
// `addTracing` onto its prototype.
registerAugmentations<Manifest<unknown>>(ServiceManifestTracingAugmentations);
