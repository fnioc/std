// Per-listener configuration factories (the reference's
// IMetricListenerConfigurationFactory / ActivityListenerConfigurationFactory
// port): each factory merges the `{listenerName}` section of every
// configuration bound through addMetricsConfiguration/addTracingConfiguration
// into one view -- later registrations win on key conflicts -- and
// addMetrics/addTracing register the concrete factory as a singleton at the
// family's factory token.
//
// Exercised through the public authoring surface only (black-box).

import { ConfigurationBuilder, type IConfiguration } from '@rhombus-std/config';
import { ServiceManifest } from '@rhombus-std/di';
import { ActivityListenerConfigurationFactory, DefaultActivityListenerConfigurationFactory,
  type IMetricListenerConfigurationFactory, MetricListenerConfigurationFactory, MetricsConfiguration,
  TracingConfiguration } from '@rhombus-std/diagnostics';
import { METRICS_LISTENER_CONFIGURATION_FACTORY_TOKEN,
  TRACING_LISTENER_CONFIGURATION_FACTORY_TOKEN } from '@rhombus-std/diagnostics.core';
import { describe, expect, test } from 'bun:test';

function configWith(data: Record<string, string>): IConfiguration {
  return new ConfigurationBuilder().addInMemoryCollection(data).build();
}

const first = () =>
  configWith({
    'MyListener:Key': 'first',
    'MyListener:OnlyFirst': 'yes',
    'OtherListener:Key': 'elsewhere',
  });
const second = () =>
  configWith({
    'MyListener:Key': 'second',
    'MyListener:OnlySecond': 'also',
  });

describe('MetricListenerConfigurationFactory', () => {
  test("merges every configuration's listener section, later registrations winning", () => {
    const factory = new MetricListenerConfigurationFactory([
      new MetricsConfiguration(first()),
      new MetricsConfiguration(second()),
    ]);

    const merged = factory.getConfiguration('MyListener');
    expect(merged.get('Key')).toBe('second'); // conflict: later wins
    expect(merged.get('OnlyFirst')).toBe('yes'); // earlier-only keys survive
    expect(merged.get('OnlySecond')).toBe('also');
  });

  test('keys are relative to the listener section, siblings excluded', () => {
    const factory = new MetricListenerConfigurationFactory([new MetricsConfiguration(first())]);

    const merged = factory.getConfiguration('MyListener');
    expect(merged.get('MyListener:Key')).toBeUndefined();
    expect(merged.get('Key')).toBe('first');
    // The sibling listener's block does not leak in.
    expect([...merged.getChildren()].map((child) => child.key)).toEqual(['Key', 'OnlyFirst']);
  });

  test('an unknown listener yields an empty configuration', () => {
    const factory = new MetricListenerConfigurationFactory([new MetricsConfiguration(first())]);

    const merged = factory.getConfiguration('NoSuchListener');
    expect([...merged.getChildren()]).toHaveLength(0);
  });

  test('no registered configurations yields an empty configuration', () => {
    const factory = new MetricListenerConfigurationFactory([]);

    expect([...factory.getConfiguration('MyListener').getChildren()]).toHaveLength(0);
  });
});

describe('DefaultActivityListenerConfigurationFactory', () => {
  test('is an ActivityListenerConfigurationFactory and merges like the metrics twin', () => {
    const factory = new DefaultActivityListenerConfigurationFactory([
      new TracingConfiguration(first()),
      new TracingConfiguration(second()),
    ]);

    expect(factory).toBeInstanceOf(ActivityListenerConfigurationFactory);
    const merged = factory.getConfiguration('MyListener');
    expect(merged.get('Key')).toBe('second');
    expect(merged.get('OnlyFirst')).toBe('yes');
  });
});

describe('addMetrics registers the metrics factory', () => {
  test('resolves as a singleton fed by every addMetricsConfiguration call', () => {
    const manifest = new ServiceManifest();
    manifest.addMetrics((metrics) => {
      metrics.addMetricsConfiguration(first()).addMetricsConfiguration(second());
    });

    // Singletons cache only inside an open scope frame; the frameless provider
    // `build()` returns resolves everything transiently (di.core §"frameless").
    const provider = manifest.build().createScope('singleton');
    const factory = provider.resolve<IMetricListenerConfigurationFactory>(
      METRICS_LISTENER_CONFIGURATION_FACTORY_TOKEN,
    );
    expect(factory).toBeInstanceOf(MetricListenerConfigurationFactory);
    expect(factory.getConfiguration('MyListener').get('Key')).toBe('second');

    // Singleton: repeated resolution yields the same instance.
    expect(
      provider.resolve<IMetricListenerConfigurationFactory>(METRICS_LISTENER_CONFIGURATION_FACTORY_TOKEN),
    ).toBe(factory);
  });

  test('with no bound configuration the factory yields empty views', () => {
    const manifest = new ServiceManifest();
    manifest.addMetrics();

    const factory = manifest.build().createScope('singleton').resolve<IMetricListenerConfigurationFactory>(
      METRICS_LISTENER_CONFIGURATION_FACTORY_TOKEN,
    );
    expect([...factory.getConfiguration('MyListener').getChildren()]).toHaveLength(0);
  });
});

describe('addTracing registers the tracing factory', () => {
  test('resolves as a singleton fed by every addTracingConfiguration call', () => {
    const manifest = new ServiceManifest();
    manifest.addTracing((tracing) => {
      tracing.addTracingConfiguration(first()).addTracingConfiguration(second());
    });

    const provider = manifest.build().createScope('singleton');
    const factory = provider.resolve<ActivityListenerConfigurationFactory>(
      TRACING_LISTENER_CONFIGURATION_FACTORY_TOKEN,
    );
    expect(factory).toBeInstanceOf(DefaultActivityListenerConfigurationFactory);
    expect(factory.getConfiguration('MyListener').get('Key')).toBe('second');
    expect(
      provider.resolve<ActivityListenerConfigurationFactory>(TRACING_LISTENER_CONFIGURATION_FACTORY_TOKEN),
    ).toBe(factory);
  });
});
