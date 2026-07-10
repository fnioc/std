// Reverse-direction dual-export (docs §28) for the MetricsOptions/TracingOptions
// value-object augmentations. Unlike the builder augmentations -- whose concrete
// receiver classes live downstream in @rhombus-std/diagnostics -- the concrete
// MetricsOptions/TracingOptions classes live in THIS package, so both the
// declaration merge onto each class AND the runtime install live here (the
// cross-package rule points the install at wherever the concrete class lives, §28).
//
// The value-object overloads that ME ships on MetricsOptions/TracingOptions --
// `EnableMetrics`/`DisableMetrics`/`EnableTracing`/`DisableTracing`, named identically
// to their builder counterparts but distinguished by `this` receiver -- were deferred
// at §22/§28 (patching a plain options bag was a distinct boundary call). #105 lands
// the method form: ME's own public surface ships these AS instance-style extension
// methods, so the receiver reads `options.enableMetrics(...)` just like every other
// dual-export member.

import { applyAugmentations } from "@rhombus-std/primitives";

import type { MeterScope } from "./Metrics/meter-scope";
import { MetricsOptionsExtensions } from "./Metrics/metrics-builder-augmentations";
import { MetricsOptions } from "./Metrics/MetricsOptions";
import type { ActivitySourceScopes } from "./Tracing/activity-source-scopes";
import { TracingOptionsExtensions } from "./Tracing/tracing-builder-augmentations";
import { TracingOptions } from "./Tracing/TracingOptions";

declare module "./Metrics/MetricsOptions" {
  interface MetricsOptions {
    enableMetrics(meterName?: string, instrumentName?: string, listenerName?: string, scopes?: MeterScope): this;
    disableMetrics(meterName?: string, instrumentName?: string, listenerName?: string, scopes?: MeterScope): this;
  }
}

declare module "./Tracing/TracingOptions" {
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

applyAugmentations(MetricsOptions, MetricsOptionsExtensions);
applyAugmentations(TracingOptions, TracingOptionsExtensions);
