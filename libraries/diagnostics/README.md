# @rhombus-std/diagnostics

**The registration and configuration surface for metrics and tracing rules.**

This package gives you `addMetrics()` / `addTracing()` on your service
registration builder: a place to declare which meters, instruments, and
activity sources are enabled or disabled, optionally bind those rules from
configuration, and resolve the assembled, reload-reactive result. It does
**not** collect or emit measurements itself — see [Notes](#notes) below.

## Install

```sh
bun add @rhombus-std/diagnostics @rhombus-std/di.core @rhombus-std/di
```

`@rhombus-std/di.core` is a peer dependency — install it alongside.
`@rhombus-std/di` (the concrete registration engine) is what actually gives
you a constructible `ServiceManifest` and a working `build()`.

Importing the package installs `addMetrics` and `addTracing` onto your
service registration builder as a side effect:

```ts
import '@rhombus-std/diagnostics';
```

## Usage

```ts
import '@rhombus-std/diagnostics';
import { ServiceManifest } from '@rhombus-std/di';
import { METRICS_OPTIONS_TOKEN } from '@rhombus-std/diagnostics.core';

const manifest = new ServiceManifest()
  .addMetrics((builder) => {
    builder.enableMetrics('MyApp.Http'); // enable a whole meter
    builder.disableMetrics('MyApp.Http', 'request.duration'); // ...except one instrument
  });

const provider = manifest.build();
const options = provider.resolve(METRICS_OPTIONS_TOKEN);
options.value.rules; // the assembled InstrumentRule[]
```

`addMetrics` registers a resolvable `Options<MetricsOptions>` assembly and, if
you pass a `configure` callback, runs it over a concrete `IMetricsBuilder`.
`addTracing` is the same shape for tracing rules and `TracingOptions`. Every
rule- and listener-related method on the builder (`enableMetrics`,
`disableMetrics`, `addMetricsListener`, and their tracing counterparts) comes
from [`@rhombus-std/diagnostics.core`](../diagnostics.core/README.md) — this
package supplies the concrete builder they attach to and the registration
glue.

## Binding rules from configuration

If you have a built `IConfiguration` (from
[`@rhombus-std/config`](../config/README.md)), bind it straight into the
builder:

```ts
import '@rhombus-std/diagnostics';
import { ConfigurationBuilder } from '@rhombus-std/config';

const configuration = new ConfigurationBuilder()
  .addInMemoryCollection({
    'EnabledMetrics:MyApp.Http:request.duration': 'false',
  })
  .build();

manifest.addMetrics((builder) => {
  builder.addMetricsConfiguration(configuration);
});
```

The resolved `Options<MetricsOptions>` re-parses automatically whenever the
underlying configuration reloads — no manual re-subscription needed.

## Key exports

| Export                                                                                                                           | What it is                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addMetrics` / `addTracing` (installed on `ServiceManifest`)                                                                     | Registers the resolvable, reload-reactive `Options<MetricsOptions>` / `Options<TracingOptions>` assembly and, if given a callback, runs it over a concrete builder. |
| `MetricsBuilder`, `TracingBuilder`                                                                                               | The concrete builder classes handed to your `configure` callback — construct one directly if you're not using the augmentation form.                                |
| `MetricsServiceExtensions`, `TracingServiceExtensions`                                                                           | The standalone function form of `addMetrics`/`addTracing`, for callers who don't want the method installed on their builder.                                        |
| `MetricsBuilderConfigurationExtensions.addMetricsConfiguration`, `TracingBuilderConfigurationExtensions.addTracingConfiguration` | Binds an `IConfiguration` into the metrics/tracing rule pipeline, reactive to reload.                                                                               |
| `MetricsConfigureOptions`, `TracingConfigureOptions`                                                                             | The configuration-parsing steps behind `addMetricsConfiguration`/`addTracingConfiguration`, exposed for manual wiring.                                              |
| `IMetricListenerConfigurationFactory`, `MetricListenerConfigurationFactory`                                                      | Builds a per-listener merged configuration view out of every `addMetricsConfiguration` call registered.                                                             |
| `ActivityListenerConfigurationFactory`, `DefaultActivityListenerConfigurationFactory`                                            | The tracing counterpart of the above.                                                                                                                               |
| `MetricsConfiguration`, `TracingConfiguration`                                                                                   | Markers tracking each configuration source bound in, consumed by the listener configuration factories.                                                              |

## How it fits

`@rhombus-std/diagnostics` builds on
[`@rhombus-std/diagnostics.core`](../diagnostics.core/README.md) for the
`MetricsOptions`/`TracingOptions` data model, the rule-matching primitives,
and the builder interfaces; on
[`@rhombus-std/di.core`](../di.core/README.md) for the service registration
surface `addMetrics`/`addTracing` attach to; and on
[`@rhombus-std/options`](../options/README.md) and
[`@rhombus-std/options.augmentations`](../options.augmentations/README.md) for the
`Options<T>` accessor and configuration-reload wiring. Install
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
