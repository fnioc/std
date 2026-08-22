// Behaviour-equivalence tests across BOTH directions of the dual-export
// convention (docs decisions.md §28): the standalone object-literal member and
// the prototype/instance method must produce identical results.
//
//   - foreign-class direction (a class owned by another package): config's
//     addInMemoryCollection on ConfigBuilder.
//   - reverse direction (a package-owned interface, method installed on the
//     downstream concrete class): caching's get/set/setPriority on
//     MemoryCache/ICacheEntry, and diagnostics' addMetricsListener on the
//     .core-interface / downstream-concrete MetricsBuilder.
//   - reverse direction, value-object receiver (§29/#105): addFilter on
//     LoggerFilterOptions, and enableMetrics/enableTracing on
//     MetricsOptions/TracingOptions -- installed onto the concrete option class.

import type { IMemoryCache } from '@rhombus-std/caching.core';
import { CacheEntrySugarAugmentations, CacheItemPriority, MemoryCacheSugarAugmentations } from '@rhombus-std/caching.core';
import { MemoryCache, MemoryCacheOptions } from '@rhombus-std/caching.memory';
import { ConfigBuilder, MemoryConfigBuilderAugmentations } from '@rhombus-std/config';
import { type Manifest, Type } from '@rhombus-std/di.core';
import { MetricsBuilder } from '@rhombus-std/diagnostics';
import { type IMetricsListener, MetricsBuilderAugmentations, MetricsOptions, MetricsOptionsAugmentations, TracingOptions, TracingOptionsAugmentations } from '@rhombus-std/diagnostics.core';
import { LoggerFilterOptions, LoggerFilterOptionsExtensions } from '@rhombus-std/logging';
import { LogLevel } from '@rhombus-std/logging.core';
import { describe, expect, test } from 'bun:test';

const METRICS_LISTENER_TYPE = Type.imported('IMetricsListener', '@rhombus-std/diagnostics.core');

describe('foreign-class direction — addInMemoryCollection', () => {
  test('method form and standalone form yield the same configuration', () => {
    const viaMethod = new ConfigBuilder().addInMemoryCollection({ Key: 'value' }).build();
    // The standalone form's `Self` collapses to its structural constraint through
    // `.call`, so the receiver type is reasserted to reach `build()`.
    const viaMember = (MemoryConfigBuilderAugmentations.addInMemoryCollection
      .call(new ConfigBuilder(), { Key: 'value' }) as ConfigBuilder).build();

    expect(viaMethod.get('Key')).toBe('value');
    expect(viaMethod.get('Key')).toBe(viaMember.get('Key'));
  });
});

describe('reverse direction — MemoryCache / ICacheEntry', () => {
  test('get/set method form equals the object-literal member form', () => {
    const cache = new MemoryCache(new MemoryCacheOptions());

    cache.set('a', 1); // method form
    MemoryCacheSugarAugmentations.set.call<IMemoryCache, [unknown, number], number>(
      cache as IMemoryCache,
      'b',
      2,
    ); // standalone member form

    expect(cache.get<number>('a')).toBe(1);
    expect(MemoryCacheSugarAugmentations.get.call(cache, 'b')).toBe(2);
    // cross-check: the two read forms agree on the same key.
    expect(cache.get<number>('b')).toBe(MemoryCacheSugarAugmentations.get.call(cache, 'b') as number);
  });

  test('entry setPriority method form equals the object-literal member form', () => {
    const cache = new MemoryCache(new MemoryCacheOptions());

    const viaMethod = cache.createEntry('x');
    viaMethod.setPriority(CacheItemPriority.High);

    const viaMember = cache.createEntry('y');
    CacheEntrySugarAugmentations.setPriority.call(viaMember, CacheItemPriority.High);

    expect(viaMethod.priority).toBe(CacheItemPriority.High);
    expect(viaMethod.priority).toBe(viaMember.priority);
  });
});

describe('reverse direction — MetricsBuilder (.core interface, downstream concrete)', () => {
  test('addMetricsListener method form equals the object-literal member form', () => {
    // Every verb returns a NEW stand-in over the SAME `recorded` log, the way
    // the real immutable chain does — a double that returned `undefined` (or
    // itself) would hide the threading the augmentation now has to do.
    const recorded: Array<[unknown, unknown]> = [];
    const make = (): Manifest<unknown> => {
      return { add: (serviceType: unknown, value: unknown) => {
        recorded.push([serviceType, value]);
        return make();
      }, build: () => undefined } as unknown as Manifest<unknown>;
    };

    const builder = new MetricsBuilder(make());
    const listener = { name: 'listener' } as IMetricsListener;

    builder.addMetricsListener(listener); // method form
    MetricsBuilderAugmentations.addMetricsListener.call(builder, listener); // standalone member form

    expect(recorded).toEqual([[METRICS_LISTENER_TYPE, listener], [METRICS_LISTENER_TYPE, listener]]);
  });
});

describe('reverse direction, value-object receiver — LoggerFilterOptions.addFilter', () => {
  // The predicate arm of the overload set. Both routes to it are exercised: the
  // method the prototype install put on the receiver, and the namespace member
  // called standalone against the same receiver.
  test('addFilter method form equals the object-literal member form', () => {
    const filter = (): boolean => true;

    const viaMethod = new LoggerFilterOptions();
    viaMethod.addFilter(filter); // method form

    const viaMember = new LoggerFilterOptions();
    LoggerFilterOptionsExtensions.addFilter.call(viaMember, filter); // standalone member form

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
    MetricsOptionsAugmentations.enableMetrics.call(viaMember, 'meter'); // standalone member form
    MetricsOptionsAugmentations.disableMetrics.call(viaMember, 'meter', 'instrument');

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
    TracingOptionsAugmentations.enableTracing.call(viaMember, 'source'); // standalone member form
    TracingOptionsAugmentations.disableTracing.call(viaMember, 'source', 'operation');

    expect(viaMethod.rules).toEqual(viaMember.rules);
    expect(viaMethod.rules.map((r) => r.enable)).toEqual([true, false]);
    // chaining survives.
    expect(viaMethod.enableTracing('s2')).toBe(viaMethod);
  });
});
