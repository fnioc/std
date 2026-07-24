// Installs enableMetrics/disableMetrics/enableTracing/disableTracing directly
// onto MetricsOptions/TracingOptions -- the value-object counterparts of the
// same-named builder methods, distinguished only by `this` receiver. Both the
// declaration merge and the runtime install live here because the concrete
// option classes live in this package.

import { applyAugmentations } from '@rhombus-std/primitives';

import type { MeterScope } from './metrics/MeterScope';
import { MetricsOptionsExtensions } from './metrics/metrics-builder-augmentations';
import { MetricsOptions } from './metrics/MetricsOptions';
import type { ActivitySourceScopes } from './tracing/ActivitySourceScopes';
import { TracingOptionsExtensions } from './tracing/tracing-builder-augmentations';
import { TracingOptions } from './tracing/TracingOptions';

declare module './metrics/MetricsOptions' {
  interface MetricsOptions {
    enableMetrics(meterName?: string, instrumentName?: string, listenerName?: string, scopes?: MeterScope): this;
    disableMetrics(meterName?: string, instrumentName?: string, listenerName?: string, scopes?: MeterScope): this;
  }
}

declare module './tracing/TracingOptions' {
  interface TracingOptions {
    enableTracing(sourceName?: string, operationName?: string, listenerName?: string,
      scopes?: ActivitySourceScopes): this;
    disableTracing(sourceName?: string, operationName?: string, listenerName?: string,
      scopes?: ActivitySourceScopes): this;
  }
}

applyAugmentations(MetricsOptions, MetricsOptionsExtensions);
applyAugmentations(TracingOptions, TracingOptionsExtensions);
