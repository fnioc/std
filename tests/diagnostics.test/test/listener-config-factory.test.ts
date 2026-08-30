// Per-listener configuration factories (the reference's
// IMetricListenerConfigFactory / ActivityListenerConfigFactory
// port): each factory merges the `{listenerName}` section of every
// configuration bound through addMetricsConfig/addTracingConfig
// into one view -- later registrations win on key conflicts -- and
// addMetrics/addTracing register the concrete factory as a singleton at the
// family's factory token.
//
// Exercised through the public authoring surface only (black-box).

import { ConfigBuilder, type IConfig } from '@rhombus-std/config';
import { di, noop } from '@rhombus-std/di';
import { ActivityListenerConfigFactory, DefaultActivityListenerConfigFactory, getMetricsManifest, getTracingManifest, type IMetricListenerConfigFactory, MetricListenerConfigFactory, MetricsConfig,
  TracingConfig } from '@rhombus-std/diagnostics';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

// The factory addresses as a plugin-less author spells them — the same interned
// nodes `typefor` derives inside @rhombus-std/diagnostics.
const METRICS_LISTENER_CONFIGURATION_FACTORY_TYPE = Type.imported('IMetricListenerConfigFactory', '@rhombus-std/diagnostics');
const TRACING_LISTENER_CONFIGURATION_FACTORY_TYPE = Type.imported('ActivityListenerConfigFactory', '@rhombus-std/diagnostics');

function configWith(data: Record<string, string>): IConfig {
  return new ConfigBuilder().addInMemoryCollection(data).build();
}

const first = () => configWith({ 'MyListener:Key': 'first', 'MyListener:OnlyFirst': 'yes', 'OtherListener:Key': 'elsewhere' });
const second = () => configWith({ 'MyListener:Key': 'second', 'MyListener:OnlySecond': 'also' });

describe('MetricListenerConfigFactory', () => {
  test("merges every configuration's listener section, later registrations winning", () => {
    const factory = new MetricListenerConfigFactory([new MetricsConfig(first()), new MetricsConfig(second())]);

    const merged = factory.getConfig('MyListener');
    expect(merged.get('Key')).toBe('second'); // conflict: later wins
    expect(merged.get('OnlyFirst')).toBe('yes'); // earlier-only keys survive
    expect(merged.get('OnlySecond')).toBe('also');
  });

  test('keys are relative to the listener section, siblings excluded', () => {
    const factory = new MetricListenerConfigFactory([new MetricsConfig(first())]);

    const merged = factory.getConfig('MyListener');
    expect(merged.get('MyListener:Key')).toBeUndefined();
    expect(merged.get('Key')).toBe('first');
    // The sibling listener's block does not leak in.
    expect([...merged.getChildren()].map((child) => child.key)).toEqual(['Key', 'OnlyFirst']);
  });

  test('an unknown listener yields an empty configuration', () => {
    const factory = new MetricListenerConfigFactory([new MetricsConfig(first())]);

    const merged = factory.getConfig('NoSuchListener');
    expect([...merged.getChildren()]).toHaveLength(0);
  });

  test('no registered configurations yields an empty configuration', () => {
    const factory = new MetricListenerConfigFactory([]);

    expect([...factory.getConfig('MyListener').getChildren()]).toHaveLength(0);
  });
});

describe('DefaultActivityListenerConfigFactory', () => {
  test('is an ActivityListenerConfigFactory and merges like the metrics twin', () => {
    const factory = new DefaultActivityListenerConfigFactory([new TracingConfig(first()), new TracingConfig(second())]);

    expect(factory).toBeInstanceOf(ActivityListenerConfigFactory);
    const merged = factory.getConfig('MyListener');
    expect(merged.get('Key')).toBe('second');
    expect(merged.get('OnlyFirst')).toBe('yes');
  });
});

describe('addMetrics registers the metrics factory', () => {
  // Needs the standard lifetime model's singleton caching, not yet wired for this suite.
  test.skip('resolves as a singleton fed by every addMetricsConfig call', () => {
    const manifest = getMetricsManifest((metrics) => {
      metrics.addMetricsConfig(first()).addMetricsConfig(second());
    });

    const provider = di.usingLifetimeModel(noop()).usingManifest(manifest).build();
    const factory: IMetricListenerConfigFactory = provider.resolve(
      METRICS_LISTENER_CONFIGURATION_FACTORY_TYPE,
    );
    expect(factory).toBeInstanceOf(MetricListenerConfigFactory);
    expect(factory.getConfig('MyListener').get('Key')).toBe('second');

    // Singleton: repeated resolution yields the same instance.
    const factoryAgain: IMetricListenerConfigFactory = provider.resolve(
      METRICS_LISTENER_CONFIGURATION_FACTORY_TYPE,
    );
    expect(factoryAgain).toBe(factory);
  });

  test('with no bound configuration the factory yields empty views', () => {
    const manifest = getMetricsManifest();

    const factory: IMetricListenerConfigFactory = di.usingLifetimeModel(noop()).usingManifest(manifest).build().resolve(
      METRICS_LISTENER_CONFIGURATION_FACTORY_TYPE,
    );
    expect([...factory.getConfig('MyListener').getChildren()]).toHaveLength(0);
  });
});

describe('addTracing registers the tracing factory', () => {
  // Needs the standard lifetime model's singleton caching, not yet wired for this suite.
  test.skip('resolves as a singleton fed by every addTracingConfig call', () => {
    const manifest = getTracingManifest((tracing) => {
      tracing.addTracingConfig(first()).addTracingConfig(second());
    });

    const provider = di.usingLifetimeModel(noop()).usingManifest(manifest).build();
    const factory: ActivityListenerConfigFactory = provider.resolve(
      TRACING_LISTENER_CONFIGURATION_FACTORY_TYPE,
    );
    expect(factory).toBeInstanceOf(DefaultActivityListenerConfigFactory);
    expect(factory.getConfig('MyListener').get('Key')).toBe('second');
    const factoryAgain: ActivityListenerConfigFactory = provider.resolve(
      TRACING_LISTENER_CONFIGURATION_FACTORY_TYPE,
    );
    expect(factoryAgain).toBe(factory);
  });
});
