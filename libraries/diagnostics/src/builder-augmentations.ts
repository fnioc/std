// Class-side declaration merges for the concrete MetricsBuilder/TracingBuilder
// (docs §28/§38). The runtime install and the interface-side merges now live at
// the augmentation-set consts:
//   - the listener/rule members self-register from diagnostics.core
//     (metrics/tracing-builder-augmentations) against
//     the IMetricsBuilder / ITracingBuilder tokens;
//   - the config-binding members self-register from this package's
//     metrics/tracing-builder-configuration-augmentations against the same tokens.
// The concrete MetricsBuilder/TracingBuilder are decorated `@augment(token)`, so
// every registered member reaches their prototypes.
//
// What stays HERE is only the CLASS-SIDE merge: the concrete classes must still
// SATISFY `implements IMetricsBuilder`/`ITracingBuilder` once the OPEN interface
// gains those members, so each concrete class re-declares the same surface. (Rule
// §38.6: interface merges move beside their const in the owning package; class-side
// merges stay downstream next to each concrete class. These merges are retired once
// diagnostics converts to a dist build -- section 5.)

import type { IConfiguration } from "@rhombus-std/config";
import type { Ctor, DepSlot } from "@rhombus-std/di.core";
import type {
  ActivityListenerBuilder,
  ActivitySourceScopes,
  IMetricsListener,
  MeterScope,
} from "@rhombus-std/diagnostics.core";
import type { Func } from "@rhombus-toolkit/func";

declare module "./Metrics/MetricsBuilder" {
  interface MetricsBuilder {
    addMetricsListener(listener: IMetricsListener): this;
    addMetricsListenerType(ctor: Ctor, signatures?: readonly (readonly DepSlot[])[]): this;
    clearMetricsListeners(): this;
    enableMetrics(meterName?: string, instrumentName?: string, listenerName?: string, scopes?: MeterScope): this;
    disableMetrics(meterName?: string, instrumentName?: string, listenerName?: string, scopes?: MeterScope): this;
    addMetricsConfiguration(configuration: IConfiguration): this;
  }
}

declare module "./Tracing/TracingBuilder" {
  interface TracingBuilder {
    addTracingListener(name: string, configure: Func<[ActivityListenerBuilder], void>): this;
    clearTracingListeners(): this;
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
    addTracingConfiguration(configuration: IConfiguration): this;
  }
}
