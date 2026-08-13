// clearMetricsListeners / clearTracingListeners -- the ports of the reference
// `MetricsBuilderAugmentations.ClearListeners` / `TracingBuilderAugmentations.ClearListeners`
// (`builder.Services.RemoveAll<...>()` through di.core's removeAll descriptor
// verb). Exercised in both dual-export forms (docs §28): the standalone
// `Set.member(builder, ...)` call and the registry-installed method, both
// against the concrete @rhombus-std/diagnostics builders (the interface-side
// merge makes the augmented members part of IMetricsBuilder/ITracingBuilder,
// so a bare `{ services }` literal no longer satisfies the interfaces).
//
// The standalone form calls `Set.member.call(builder, ...)`: the augmentation
// methods are `this`-based and installed verbatim.

import '@rhombus-std/di';
import { DefaultManifest, type Manifest, Type } from '@rhombus-std/di.core';
import { MetricsBuilder, TracingBuilder } from '@rhombus-std/diagnostics';
import { type IMetricsBuilder, type IMetricsListener, type ITracingBuilder, METRICS_CONFIGURE_TYPE,
  METRICS_LISTENER_TYPE, MetricsBuilderAugmentations, TRACING_CONFIGURE_TYPE, TRACING_LISTENER_TYPE,
  TracingBuilderAugmentations } from '@rhombus-std/diagnostics.core';
import { describe, expect, test } from 'bun:test';

function listener(name: string): IMetricsListener {
  return { name };
}

/**
 * Builds the manifest the BUILDER currently holds and resolves the aggregated
 * registrations of `type`.
 *
 * It reads through the builder rather than taking a manifest: the chain is
 * immutable, so the manifest each builder was constructed with never sees a
 * single one of these registrations — only the one the builder now holds does.
 */
function registered(builder: { services: Manifest; }, type: Type): unknown[] {
  const results: unknown[] = builder.services.build().getRequiredService(Type.named('Array', 'global', [type]));
  return results;
}

describe('MetricsBuilderAugmentations.clearMetricsListeners', () => {
  test('removes every IMetricsListener registration', () => {
    const manifest = new DefaultManifest();
    const builder: IMetricsBuilder = new MetricsBuilder(manifest);

    MetricsBuilderAugmentations.addMetricsListener.call(builder, listener('a'));
    MetricsBuilderAugmentations.addMetricsListener.call(builder, listener('b'));
    const returned = MetricsBuilderAugmentations.clearMetricsListeners.call(builder);

    expect(returned).toBe(builder);
    expect(registered(builder, METRICS_LISTENER_TYPE)).toHaveLength(0);
  });

  test('listeners added AFTER a clear survive', () => {
    const manifest = new DefaultManifest();
    const builder: IMetricsBuilder = new MetricsBuilder(manifest);

    MetricsBuilderAugmentations.addMetricsListener.call(builder, listener('stale'));
    MetricsBuilderAugmentations.clearMetricsListeners.call(builder);
    const fresh = listener('fresh');
    MetricsBuilderAugmentations.addMetricsListener.call(builder, fresh);

    expect(registered(builder, METRICS_LISTENER_TYPE)).toEqual([fresh]);
  });

  test('only the listener slot is cleared -- other registrations survive', () => {
    const manifest = new DefaultManifest();
    const builder: IMetricsBuilder = new MetricsBuilder(manifest);

    MetricsBuilderAugmentations.addMetricsListener.call(builder, listener('a'));
    MetricsBuilderAugmentations.enableMetrics.call(builder, 'some-meter');
    MetricsBuilderAugmentations.clearMetricsListeners.call(builder);

    expect(registered(builder, METRICS_CONFIGURE_TYPE)).toHaveLength(1);
  });

  test('the method form reaches the concrete MetricsBuilder through the registry', () => {
    const manifest = new DefaultManifest();
    const builder = new MetricsBuilder(manifest);

    expect(builder.clearMetricsListeners).toBeInstanceOf(Function);
    builder.addMetricsListener(listener('a')).clearMetricsListeners();

    expect(registered(builder, METRICS_LISTENER_TYPE)).toHaveLength(0);
  });
});

describe('TracingBuilderAugmentations.clearTracingListeners', () => {
  test('removes every ActivityListenerBuilder registration', () => {
    const manifest = new DefaultManifest();
    const builder: ITracingBuilder = new TracingBuilder(manifest);

    TracingBuilderAugmentations.addTracingListener.call(builder, 'L1', () => {});
    TracingBuilderAugmentations.addTracingListener.call(builder, 'L2', () => {});
    const returned = TracingBuilderAugmentations.clearTracingListeners.call(builder);

    expect(returned).toBe(builder);
    expect(registered(builder, TRACING_LISTENER_TYPE)).toHaveLength(0);
  });

  test('listeners added AFTER a clear survive; rules are untouched', () => {
    const manifest = new DefaultManifest();
    const builder: ITracingBuilder = new TracingBuilder(manifest);

    TracingBuilderAugmentations.addTracingListener.call(builder, 'stale', () => {});
    TracingBuilderAugmentations.enableTracing.call(builder, 'MySource');
    TracingBuilderAugmentations.clearTracingListeners.call(builder);
    TracingBuilderAugmentations.addTracingListener.call(builder, 'fresh', () => {});

    const remaining = registered(builder, TRACING_LISTENER_TYPE);
    expect(remaining).toHaveLength(1);
    expect((remaining[0] as { name: string; }).name).toBe('fresh');

    expect(registered(builder, TRACING_CONFIGURE_TYPE)).toHaveLength(1);
  });

  test('the method form reaches the concrete TracingBuilder through the registry', () => {
    const manifest = new DefaultManifest();
    const builder = new TracingBuilder(manifest);

    expect(builder.clearTracingListeners).toBeInstanceOf(Function);
    builder.addTracingListener('L1', () => {}).clearTracingListeners();

    expect(registered(builder, TRACING_LISTENER_TYPE)).toHaveLength(0);
  });
});
