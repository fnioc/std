// Reverse-direction dual-export (docs §22) for the metrics/tracing builder
// extensions. Their receiver interfaces (IMetricsBuilder/ITracingBuilder) live in
// diagnostics.core and their standalone free-function form already ships there
// (and, for the config-binding pair, here) -- this module ADDS the instance-method
// form so `builder.addMetricsListener(...)` reads as fluently as the standalone
// `addMetricsListener(builder, ...)`.
//
// Per the cross-package rule: the interface lives in diagnostics.core but the only
// concrete receiver classes (MetricsBuilder/TracingBuilder) live here, so BOTH the
// declaration merge onto the interface AND the runtime install onto the concrete
// class live in this downstream package -- a diagnostics.core-only consumer never
// gets a method type with no runtime behind it.

import type { IConfiguration } from "@rhombus-std/config";
import type { Ctor, DepSlot } from "@rhombus-std/di.core";
import type {
  ActivitySourceScopes,
  IMetricsBuilder,
  IMetricsListener,
  ITracingBuilder,
  MeterScope,
} from "@rhombus-std/diagnostics.core";
import { ActivityListenerBuilder } from "@rhombus-std/diagnostics.core";
import {
  addMetricsListener,
  addMetricsListenerType,
  addTracingListener,
  disableMetrics,
  disableTracing,
  enableMetrics,
  enableTracing,
} from "@rhombus-std/diagnostics.core";
import { applyExtensions, defineExtensions } from "@rhombus-std/primitives";
import type { Func } from "@rhombus-toolkit/func";

import { MetricsBuilder } from "./metrics-builder";
import { addMetricsConfiguration } from "./metrics-builder-configuration-extensions";
import { TracingBuilder } from "./tracing-builder";
import { addTracingConfiguration } from "./tracing-builder-configuration-extensions";

// Merge the method form onto the OWNING interface (so a consumer holding
// IMetricsBuilder sees it) AND onto the concrete class (so it still SATISFIES the
// interface once the new names are on it -- the same both-sides merge the
// foreign-class sites use for ServiceManifestClass).
declare module "@rhombus-std/diagnostics.core" {
  interface IMetricsBuilder {
    addMetricsListener(listener: IMetricsListener): this;
    addMetricsListenerType(ctor: Ctor, signatures?: readonly (readonly DepSlot[])[]): this;
    enableMetrics(meterName?: string, instrumentName?: string, listenerName?: string, scopes?: MeterScope): this;
    disableMetrics(meterName?: string, instrumentName?: string, listenerName?: string, scopes?: MeterScope): this;
    addMetricsConfiguration(configuration: IConfiguration): this;
  }

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
    addTracingConfiguration(configuration: IConfiguration): this;
  }
}

declare module "./metrics-builder" {
  interface MetricsBuilder {
    addMetricsListener(listener: IMetricsListener): this;
    addMetricsListenerType(ctor: Ctor, signatures?: readonly (readonly DepSlot[])[]): this;
    enableMetrics(meterName?: string, instrumentName?: string, listenerName?: string, scopes?: MeterScope): this;
    disableMetrics(meterName?: string, instrumentName?: string, listenerName?: string, scopes?: MeterScope): this;
    addMetricsConfiguration(configuration: IConfiguration): this;
  }
}

declare module "./tracing-builder" {
  interface TracingBuilder {
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
    addTracingConfiguration(configuration: IConfiguration): this;
  }
}

const metricsBuilderExtensions = defineExtensions<IMetricsBuilder>()({
  addMetricsListener,
  addMetricsListenerType,
  enableMetrics,
  disableMetrics,
  addMetricsConfiguration,
});

const tracingBuilderExtensions = defineExtensions<ITracingBuilder>()({
  addTracingListener,
  enableTracing,
  disableTracing,
  addTracingConfiguration,
});

applyExtensions<IMetricsBuilder>(MetricsBuilder, metricsBuilderExtensions);
applyExtensions<ITracingBuilder>(TracingBuilder, tracingBuilderExtensions);
