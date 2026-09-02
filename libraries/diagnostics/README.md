# @rhombus-std/diagnostics

**The registration and configuration surface for metrics and tracing rules.**

This package gives you `getMetricsManifest()` / `getTracingManifest()`: each
builds a manifest you merge into your own — a place to declare which meters,
instruments, and activity sources are enabled or disabled, optionally bind
those rules from configuration, and resolve the assembled, reload-reactive
result. It does **not** collect or emit measurements itself — see
[Notes](#notes) below.

## Install

```sh
bun add @rhombus-std/diagnostics @rhombus-std/di.core @rhombus-std/di
```

`@rhombus-std/di.core` is a peer dependency — install it alongside.
`@rhombus-std/di` (the concrete registration engine) is what turns a manifest
into a resolvable container; `@rhombus-std/diagnostics` doesn't depend on it
itself, since `getMetricsManifest`/`getTracingManifest` only ever hand you a
manifest to merge, never a container.

## Usage

```ts
import { Builder } from '@rhombus-std/di';
import { Manifest, Type } from '@rhombus-std/di.core';
import { getMetricsManifest } from '@rhombus-std/diagnostics';

let services: Manifest<'singleton'> = Manifest.empty<'singleton'>();
services = services.addMany(getMetricsManifest((builder) => {
  builder.enableMetrics('MyApp.Http'); // enable a whole meter
  builder.disableMetrics('MyApp.Http', 'request.duration'); // ...except one instrument
}));

const provider = Builder.withServices(() => services).build();
const METRICS_OPTIONS_TYPE: Type = Type.from(
  '@rhombus-std/options:IOptions<@rhombus-std/diagnostics.core:MetricsOptions>',
);
const options = provider.resolve(METRICS_OPTIONS_TYPE);
options.value.rules; // the assembled InstrumentRule[]
```

`getMetricsManifest` builds its registrations on the narrowest lifetime
vocabulary it needs (`'singleton'`) and hands back a manifest — merging it
into your own, as above, is what checks your manifest's vocabulary covers it.
If you pass a `configure` callback, it runs over a concrete `IMetricsBuilder`
before the manifest comes back, so anything it registers is part of the
merge too. `getTracingManifest` is the same shape for tracing rules and
`TracingOptions`. Every rule- and listener-related method on the builder
(`enableMetrics`, `disableMetrics`, `addMetricsListener`, and their tracing
counterparts) comes from
[`@rhombus-std/diagnostics.core`](../diagnostics.core/README.md) — this
package supplies the concrete builder they attach to.

## Binding rules from configuration

If you have a built `IConfig` (from
[`@rhombus-std/config`](../config/README.md)), bind it straight into the
builder:

```ts
import { ConfigBuilder } from '@rhombus-std/config';
import { getMetricsManifest } from '@rhombus-std/diagnostics';

const config = new ConfigBuilder().addInMemoryCollection({ 'EnabledMetrics:MyApp.Http:request.duration': 'false' })
  .build();

services = services.addMany(getMetricsManifest((builder) => {
  builder.addMetricsConfig(config);
}));
```

The resolved `IOptions<MetricsOptions>` re-parses automatically whenever the
underlying configuration reloads — no manual re-subscription needed.

## Key exports

| Export                                                                                                     | What it is                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getMetricsManifest` / `getTracingManifest`                                                                | Builds the resolvable, reload-reactive `IOptions<MetricsOptions>` / `IOptions<TracingOptions>` assembly on `Manifest<'singleton'>` and, if given a callback, runs it over a concrete builder. Merge the result into your own manifest. |
| `MetricsBuilder`, `TracingBuilder`                                                                         | The concrete builder classes handed to your `configure` callback — construct one directly, or use their static `run(manifest, configure)`, if you're not going through `getMetricsManifest`/`getTracingManifest`.                      |
| `MetricsBuilderConfigAugmentations.addMetricsConfig`, `TracingBuilderConfigAugmentations.addTracingConfig` | Binds an `IConfig` into the metrics/tracing rule pipeline, reactive to reload.                                                                                                                                                         |
| `MetricsConfigureOptions`, `TracingConfigureOptions`                                                       | The configuration-parsing steps behind `addMetricsConfig`/`addTracingConfig`, exposed for manual wiring.                                                                                                                               |
| `IMetricListenerConfigFactory`, `MetricListenerConfigFactory`                                              | Builds a per-listener merged configuration view out of every `addMetricsConfig` call registered.                                                                                                                                       |
| `ActivityListenerConfigFactory`, `DefaultActivityListenerConfigFactory`                                    | The tracing counterpart of the above.                                                                                                                                                                                                  |
| `MetricsConfig`, `TracingConfig`                                                                           | Markers tracking each configuration source bound in, consumed by the listener configuration factories.                                                                                                                                 |

## How it fits

`@rhombus-std/diagnostics` builds on
[`@rhombus-std/diagnostics.core`](../diagnostics.core/README.md) for the
`MetricsOptions`/`TracingOptions` data model, the rule-matching primitives,
and the builder interfaces; on its `@rhombus-std/di.core` peer for the
`Manifest` a caller merges `getMetricsManifest`/`getTracingManifest`'s result
into (and on `@rhombus-std/di` to turn that manifest into a resolvable
container); and on [`@rhombus-std/options`](../options/README.md) and
[`@rhombus-std/options.augmentations`](../options.augmentations/README.md) for the
`IOptions<T>` accessor and configuration-reload wiring. Install
[`@rhombus-std/config`](../config/README.md) alongside it if you want to
bind rules from configuration rather than hard-coding them in a `configure`
callback.

## Notes

This package is the **configuration and registration** surface only — it
does not include a metrics/tracing collection runtime. There is no meter,
instrument, activity, or activity-source implementation here: nothing
actually records or emits a measurement. What you get is a typed, testable,
reload-reactive model of _which_ meters and activity sources should be
enabled — useful on its own for driving your own instrumentation code, or as
the configuration layer underneath one you build or adopt separately.
