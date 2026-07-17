// Behaviour-equivalence tests across BOTH directions of the dual-export
// convention (docs decisions.md §28): the standalone object-literal member and
// the prototype/instance method must produce identical results.
//
//   - foreign-class direction (a class owned by another package): config's
//     addInMemoryCollection on ConfigurationBuilder.
//   - reverse direction (a package-owned interface, method installed on the
//     downstream concrete class): caching's get/set/setPriority on
//     MemoryCache/ICacheEntry, and diagnostics' addMetricsListener on the
//     .core-interface / downstream-concrete MetricsBuilder.
//   - reverse direction, value-object receiver (§29/#105): addFilter on
//     LoggerFilterOptions, and enableMetrics/enableTracing on
//     MetricsOptions/TracingOptions -- installed onto the concrete option class.

import { CacheEntryExtensions, CacheExtensions, CacheItemPriority } from '@rhombus-std/caching.core';
import { MemoryCache, MemoryCacheOptions } from '@rhombus-std/caching.memory';
import { ConfigurationBuilder, MemoryConfigurationBuilderExtensions } from '@rhombus-std/config';
import type { IServiceManifestBase } from '@rhombus-std/di.core';
import { MetricsBuilder } from '@rhombus-std/diagnostics';
import { type IMetricsListener, METRICS_LISTENER_TOKEN, MetricsBuilderExtensions, MetricsOptions,
  MetricsOptionsExtensions, TracingOptions, TracingOptionsExtensions } from '@rhombus-std/diagnostics.core';
import { LoggerFilterOptions, LoggerFilterOptionsExtensions } from '@rhombus-std/logging';
import { LogLevel } from '@rhombus-std/logging.core';
import { describe, expect, test } from 'bun:test';

describe('foreign-class direction — addInMemoryCollection', () => {
  test('method form and standalone form yield the same configuration', () => {
    const viaMethod = new ConfigurationBuilder().addInMemoryCollection({ Key: 'value' }).build();
    const viaMember = MemoryConfigurationBuilderExtensions
      .addInMemoryCollection(new ConfigurationBuilder(), { Key: 'value' })
      .build();

    expect(viaMethod.get('Key')).toBe('value');
    expect(viaMethod.get('Key')).toBe(viaMember.get('Key'));
  });
});

describe('reverse direction — MemoryCache / ICacheEntry', () => {
  test('get/set method form equals the object-literal member form', () => {
    const cache = new MemoryCache(new MemoryCacheOptions());

    cache.set('a', 1); // method form
    CacheExtensions.set(cache, 'b', 2); // standalone member form

    expect(cache.get<number>('a')).toBe(1);
    expect(CacheExtensions.get<number>(cache, 'b')).toBe(2);
    // cross-check: the two read forms agree on the same key.
    expect(cache.get('b')).toBe(CacheExtensions.get(cache, 'b'));
  });

  test('entry setPriority method form equals the object-literal member form', () => {
    const cache = new MemoryCache(new MemoryCacheOptions());

    const viaMethod = cache.createEntry('x');
    viaMethod.setPriority(CacheItemPriority.High);

    const viaMember = cache.createEntry('y');
    CacheEntryExtensions.setPriority(viaMember, CacheItemPriority.High);

    expect(viaMethod.priority).toBe(CacheItemPriority.High);
    expect(viaMethod.priority).toBe(viaMember.priority);
  });
});

describe('reverse direction — MetricsBuilder (.core interface, downstream concrete)', () => {
  test('addMetricsListener method form equals the object-literal member form', () => {
    const recorded: [unknown, unknown][] = [];
    const services = {
      add: () => ({ as: () => {} }),
      addFactory: () => ({ as: () => {} }),
      addValue: (token: unknown, value: unknown) => {
        recorded.push([token, value]);
      },
      build: () => undefined,
    } as unknown as IServiceManifestBase;

    const builder = new MetricsBuilder(services);
    const listener = { name: 'listener' } as IMetricsListener;

    builder.addMetricsListener(listener); // method form
    MetricsBuilderExtensions.addMetricsListener(builder, listener); // standalone member form

    expect(recorded).toEqual([
      [METRICS_LISTENER_TOKEN, listener],
      [METRICS_LISTENER_TOKEN, listener],
    ]);
  });
});

describe('reverse direction, value-object receiver — LoggerFilterOptions.addFilter (§29/#105)', () => {
  test('addFilter method form equals the object-literal member form', () => {
    const viaMethod = new LoggerFilterOptions();
    viaMethod.addFilter('Cat', LogLevel.Warning); // method form

    const viaMember = new LoggerFilterOptions();
    LoggerFilterOptionsExtensions.addFilter(viaMember, 'Cat', LogLevel.Warning); // standalone member form

    expect(viaMethod.rules.length).toBe(1);
    expect(viaMethod.rules[0]).toEqual(viaMember.rules[0]);
    // chaining survives the prototype install.
    expect(viaMethod.addFilter('Other', LogLevel.Error)).toBe(viaMethod);
    expect(viaMethod.rules.length).toBe(2);
  });
});

describe('reverse direction, value-object receiver — MetricsOptions (§29/#105)', () => {
  test('enableMetrics/disableMetrics method form equals the object-literal member form', () => {
    const viaMethod = new MetricsOptions();
    viaMethod.enableMetrics('meter'); // method form
    viaMethod.disableMetrics('meter', 'instrument');

    const viaMember = new MetricsOptions();
    MetricsOptionsExtensions.enableMetrics(viaMember, 'meter'); // standalone member form
    MetricsOptionsExtensions.disableMetrics(viaMember, 'meter', 'instrument');

    expect(viaMethod.rules).toEqual(viaMember.rules);
    expect(viaMethod.rules.map((r) => r.enable)).toEqual([true, false]);
    // chaining survives.
    expect(viaMethod.enableMetrics('m2')).toBe(viaMethod);
  });
});

describe('reverse direction, value-object receiver — TracingOptions (§29/#105)', () => {
  test('enableTracing/disableTracing method form equals the object-literal member form', () => {
    const viaMethod = new TracingOptions();
    viaMethod.enableTracing('source'); // method form
    viaMethod.disableTracing('source', 'operation');

    const viaMember = new TracingOptions();
    TracingOptionsExtensions.enableTracing(viaMember, 'source'); // standalone member form
    TracingOptionsExtensions.disableTracing(viaMember, 'source', 'operation');

    expect(viaMethod.rules).toEqual(viaMember.rules);
    expect(viaMethod.rules.map((r) => r.enable)).toEqual([true, false]);
    // chaining survives.
    expect(viaMethod.enableTracing('s2')).toBe(viaMethod);
  });
});
