// clearMetricsListeners / clearTracingListeners -- the ports of the reference
// `MetricsBuilderExtensions.ClearListeners` / `TracingBuilderExtensions.ClearListeners`
// (`builder.Services.RemoveAll<...>()` through di.core's removeAll descriptor
// verb). Exercised in both dual-export forms (docs §28): the standalone
// `Set.member(builder, ...)` call and the registry-installed method, both
// against the concrete @rhombus-std/diagnostics builders (the interface-side
// merge makes the augmented members part of IMetricsBuilder/ITracingBuilder,
// so a bare `{ services }` literal no longer satisfies the interfaces).

import { ServiceManifest } from "@rhombus-std/di";
import type { ServiceManifest as Manifest } from "@rhombus-std/di.core";
import { MetricsBuilder, TracingBuilder } from "@rhombus-std/diagnostics";
import {
  type IMetricsBuilder,
  type IMetricsListener,
  type ITracingBuilder,
  METRICS_CONFIGURE_TOKEN,
  METRICS_LISTENER_TOKEN,
  MetricsBuilderExtensions,
  TRACING_CONFIGURE_TOKEN,
  TRACING_LISTENER_TOKEN,
  TracingBuilderExtensions,
} from "@rhombus-std/diagnostics.core";
import { describe, expect, test } from "bun:test";

function listener(name: string): IMetricsListener {
  return { name };
}

/** Builds the manifest and resolves the aggregated registrations of `token`. */
function registered(manifest: Manifest, token: string): unknown[] {
  return manifest.build().resolve<unknown[]>(`Array<${token}>`);
}

describe("MetricsBuilderExtensions.clearMetricsListeners", () => {
  test("removes every IMetricsListener registration", () => {
    const manifest = new ServiceManifest();
    const builder: IMetricsBuilder = new MetricsBuilder(manifest);

    MetricsBuilderExtensions.addMetricsListener(builder, listener("a"));
    MetricsBuilderExtensions.addMetricsListener(builder, listener("b"));
    const returned = MetricsBuilderExtensions.clearMetricsListeners(builder);

    expect(returned).toBe(builder);
    expect(registered(manifest, METRICS_LISTENER_TOKEN)).toHaveLength(0);
  });

  test("listeners added AFTER a clear survive", () => {
    const manifest = new ServiceManifest();
    const builder: IMetricsBuilder = new MetricsBuilder(manifest);

    MetricsBuilderExtensions.addMetricsListener(builder, listener("stale"));
    MetricsBuilderExtensions.clearMetricsListeners(builder);
    const fresh = listener("fresh");
    MetricsBuilderExtensions.addMetricsListener(builder, fresh);

    expect(registered(manifest, METRICS_LISTENER_TOKEN)).toEqual([fresh]);
  });

  test("only the listener slot is cleared -- other registrations survive", () => {
    const manifest = new ServiceManifest();
    const builder: IMetricsBuilder = new MetricsBuilder(manifest);

    MetricsBuilderExtensions.addMetricsListener(builder, listener("a"));
    MetricsBuilderExtensions.enableMetrics(builder, "some-meter");
    MetricsBuilderExtensions.clearMetricsListeners(builder);

    expect(registered(manifest, METRICS_CONFIGURE_TOKEN)).toHaveLength(1);
  });

  test("the method form reaches the concrete MetricsBuilder through the registry", () => {
    const manifest = new ServiceManifest();
    const builder = new MetricsBuilder(manifest);

    expect(builder.clearMetricsListeners).toBeInstanceOf(Function);
    builder.addMetricsListener(listener("a")).clearMetricsListeners();

    expect(registered(manifest, METRICS_LISTENER_TOKEN)).toHaveLength(0);
  });
});

describe("TracingBuilderExtensions.clearTracingListeners", () => {
  test("removes every ActivityListenerBuilder registration", () => {
    const manifest = new ServiceManifest();
    const builder: ITracingBuilder = new TracingBuilder(manifest);

    TracingBuilderExtensions.addTracingListener(builder, "L1", () => {});
    TracingBuilderExtensions.addTracingListener(builder, "L2", () => {});
    const returned = TracingBuilderExtensions.clearTracingListeners(builder);

    expect(returned).toBe(builder);
    expect(registered(manifest, TRACING_LISTENER_TOKEN)).toHaveLength(0);
  });

  test("listeners added AFTER a clear survive; rules are untouched", () => {
    const manifest = new ServiceManifest();
    const builder: ITracingBuilder = new TracingBuilder(manifest);

    TracingBuilderExtensions.addTracingListener(builder, "stale", () => {});
    TracingBuilderExtensions.enableTracing(builder, "MySource");
    TracingBuilderExtensions.clearTracingListeners(builder);
    TracingBuilderExtensions.addTracingListener(builder, "fresh", () => {});

    const remaining = registered(manifest, TRACING_LISTENER_TOKEN);
    expect(remaining).toHaveLength(1);
    expect((remaining[0] as { name: string }).name).toBe("fresh");

    expect(registered(manifest, TRACING_CONFIGURE_TOKEN)).toHaveLength(1);
  });

  test("the method form reaches the concrete TracingBuilder through the registry", () => {
    const manifest = new ServiceManifest();
    const builder = new TracingBuilder(manifest);

    expect(builder.clearTracingListeners).toBeInstanceOf(Function);
    builder.addTracingListener("L1", () => {}).clearTracingListeners();

    expect(registered(manifest, TRACING_LISTENER_TOKEN)).toHaveLength(0);
  });
});
